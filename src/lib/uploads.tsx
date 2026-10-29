import * as Network from 'expo-network';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { errorCode } from './errors';
import { readJson, writeJson } from './kv';
import { deleteLocalCopy } from './media-prep';
import { useSession } from './session';
import type { NewMedia } from './types';

export type UploadStatus = 'queued' | 'uploading' | 'failed' | 'done';

export type QueueItem = NewMedia & {
  /** The user who captured it; items only upload under that account. */
  owner: string;
  status: UploadStatus;
  progress: number;
  error: string | null;
  /** Permanent failures (e.g. the trip ended) are not retried automatically. */
  permanent: boolean;
  attempts: number;
};

type UploadContextValue = {
  items: QueueItem[];
  enqueue(media: NewMedia[]): void;
  retry(id: string): void;
  discard(id: string): void;
  clearDone(tripId: string): void;
  /** Deletes every queued item and its local file (sign-out, account deletion). */
  clearAll(): void;
  online: boolean;
};

const QUEUE_KEY = 'upload-queue';
const MAX_AUTO_ATTEMPTS = 5;
/** Delay before automatic retry n (after attempt n failed), in ms. */
const RETRY_DELAYS = [2000, 5000, 15000, 30000];
const PERMANENT = new Set(['upload_window_closed', 'not_found', 'forbidden', 'invalid_media_type']);

const UploadContext = createContext<UploadContextValue | null>(null);

function describe(error: unknown): { message: string; permanent: boolean } {
  const code = errorCode(error);
  const raw = error instanceof Error ? error.message : '';
  if (code === 'upload_window_closed') {
    return { message: 'The trip ended before this finished uploading, so it can’t be added.', permanent: true };
  }
  if (code === 'not_found' || code === 'forbidden') {
    return { message: 'You’re no longer a member of this trip.', permanent: true };
  }
  if (code && PERMANENT.has(code)) return { message: 'This file can’t be uploaded.', permanent: true };
  if (raw === 'local_file_missing') {
    return { message: 'The saved copy of this memory is missing from this device, so it can’t be uploaded.', permanent: true };
  }
  if (raw === 'too_large') return { message: 'This file is too large to upload.', permanent: true };
  // The server rejected the request itself (bad size, type, …): retrying the
  // same request can never succeed.
  if (/violates check constraint|invalid input syntax|22023|23514/.test(raw)) {
    return { message: 'This file couldn’t be uploaded. Discard it and add it again.', permanent: true };
  }
  return { message: 'Upload interrupted. Retrying automatically…', permanent: false };
}

export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const { backend, userId } = useSession();
  const [items, setItems] = useState<QueueItem[]>(() =>
    readJson<QueueItem[]>(QUEUE_KEY, [])
      // Preview mode never survives a relaunch, so neither do its items.
      .filter((item) => {
        if (item.owner !== 'preview') return true;
        deleteLocalCopy(item.fileUri);
        return false;
      })
      // An upload interrupted by the app being terminated restarts from the
      // beginning; reservation is idempotent and duplicates are detected.
      .map((item) => (item.status === 'uploading' ? { ...item, status: 'queued' as const, progress: 0 } : item))
      .filter((item) => item.status !== 'done'),
  );
  const [online, setOnline] = useState(true);
  const running = useRef<string | null>(null);
  const retryTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const abort = useRef<AbortController | null>(null);

  // Persist everything except finished items.
  useEffect(() => {
    writeJson(QUEUE_KEY, items.filter((i) => i.status !== 'done'));
  }, [items]);

  const patch = useCallback((id: string, update: Partial<QueueItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...update } : i)));
  }, []);

  const requeueTransientFailures = useCallback(() => {
    setItems((prev) =>
      prev.map((i) =>
        i.status === 'failed' && !i.permanent && i.attempts < MAX_AUTO_ATTEMPTS
          ? { ...i, status: 'queued', error: null }
          : i,
      ),
    );
  }, []);

  useEffect(() => {
    Network.getNetworkStateAsync().then((s) => setOnline(s.isConnected !== false));
    const net = Network.addNetworkStateListener((s) => {
      const isOnline = s.isConnected !== false && s.isInternetReachable !== false;
      setOnline(isOnline);
      if (isOnline) requeueTransientFailures();
    });
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') requeueTransientFailures();
    });
    return () => {
      net.remove();
      app.remove();
    };
  }, [requeueTransientFailures]);

  const upload = useCallback(
    (next: QueueItem, controller: AbortController) => {
      const attempt = next.attempts + 1;
      patch(next.id, { status: 'uploading', progress: 0, error: null, attempts: attempt });

      let lastTick = 0;
      backend
        .uploadMedia(
          next,
          (sent, total) => {
            const now = Date.now();
            if (now - lastTick < 150) return;
            lastTick = now;
            patch(next.id, { progress: total > 0 ? Math.min(sent / total, 0.99) : 0 });
          },
          controller.signal,
          attempt,
        )
        .then((outcome) => {
          if (outcome === 'ready') {
            deleteLocalCopy(next.fileUri);
            patch(next.id, { status: 'done', progress: 1 });
          } else {
            patch(next.id, { status: 'failed', permanent: true, error: 'The server couldn’t verify this file, so it wasn’t saved.' });
          }
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          const { message, permanent } = describe(error);
          if (__DEV__) {
            // Short, non-sensitive cause for debugging (no tokens, URLs or paths).
            const cause = error instanceof Error ? error.message.slice(0, 120) : String(error);
            console.warn(`[upload] attempt ${attempt} failed: ${cause}`);
          }
          patch(next.id, { status: 'failed', error: message, permanent });
          // Transient failure: retry automatically with backoff.
          if (!permanent && attempt < MAX_AUTO_ATTEMPTS) {
            const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)];
            retryTimers.current.set(
              next.id,
              setTimeout(() => {
                retryTimers.current.delete(next.id);
                setItems((prev) =>
                  prev.map((i) => (i.id === next.id && i.status === 'failed' && !i.permanent ? { ...i, status: 'queued', error: null } : i)),
                );
              }, delay),
            );
          }
        })
        .finally(() => {
          running.current = null;
          abort.current = null;
          // Trigger the effect again for the next queued item.
          setItems((prev) => [...prev]);
        });
    },
    [backend, patch],
  );

  useEffect(() => {
    const timers = retryTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  // Process one upload at a time, in order.
  useEffect(() => {
    if (running.current || !online || !userId) return;
    const next = items.find((i) => i.status === 'queued' && i.owner === userId);
    if (!next) return;

    running.current = next.id;
    const controller = new AbortController();
    abort.current = controller;
    queueMicrotask(() => upload(next, controller));
  }, [items, online, userId, upload]);

  const value = useMemo<UploadContextValue>(
    () => ({
      items,
      online,
      enqueue(media) {
        if (!userId) return;
        setItems((prev) => [
          ...prev,
          ...media.map((m) => ({ ...m, owner: userId, status: 'queued' as const, progress: 0, error: null, permanent: false, attempts: 0 })),
        ]);
      },
      retry(id) {
        patch(id, { status: 'queued', error: null, permanent: false, attempts: 0 });
      },
      discard(id) {
        if (running.current === id) abort.current?.abort();
        setItems((prev) => {
          const item = prev.find((i) => i.id === id);
          if (item) deleteLocalCopy(item.fileUri);
          return prev.filter((i) => i.id !== id);
        });
      },
      clearDone(tripId) {
        setItems((prev) => prev.filter((i) => !(i.tripId === tripId && i.status === 'done')));
      },
      clearAll() {
        abort.current?.abort();
        setItems((prev) => {
          prev.forEach((i) => deleteLocalCopy(i.fileUri));
          return [];
        });
      },
    }),
    [items, online, userId, patch],
  );

  return <UploadContext value={value}>{children}</UploadContext>;
}

export function useUploads() {
  const ctx = use(UploadContext);
  if (!ctx) throw new Error('useUploads must be used inside UploadQueueProvider');
  return ctx;
}

export function useTripUploads(tripId: string) {
  const { items, ...rest } = useUploads();
  const { userId } = useSession();
  const tripItems = useMemo(() => items.filter((i) => i.tripId === tripId && i.owner === userId), [items, tripId, userId]);
  return { items: tripItems, ...rest };
}
