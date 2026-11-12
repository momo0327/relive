import { File, Paths } from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useEffect, useState } from 'react';

import { readJson, writeJson } from './kv';
import type { MediaItem } from './types';

/**
 * Video preview frames (the first frame) are made once per memory and kept on this device, so a
 * video is only ever touched the first time its tile is on screen. At most two
 * are made at a time.
 */
const THUMBS_KEY = 'video-thumbs';
const thumbnailCache = new Map<string, string>(Object.entries(readJson<Record<string, string>>(THUMBS_KEY, {})));
let running = 0;
const waiting: (() => void)[] = [];
function nextSlot(): Promise<void> {
  if (running < 2) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waiting.push(() => resolve()));
}
function releaseSlot() {
  const next = waiting.shift();
  if (next) next();
  else running -= 1;
}

export function useVideoThumbnail(item: MediaItem, enabled: boolean): string | null {
  const [uri, setUri] = useState(() => {
    const cached = thumbnailCache.get(item.id);
    return cached && new File(cached).exists ? cached : null;
  });
  useEffect(() => {
    if (!enabled || uri || item.kind !== 'video' || !item.url) return;
    let cancelled = false;
    (async () => {
      await nextSlot();
      try {
        if (cancelled) return;
        const result = await VideoThumbnails.getThumbnailAsync(item.url!, {
          time: 500,
          quality: 0.5,
        });
        // Keep it in the app's documents so iOS doesn't clear it with the cache.
        const target = new File(Paths.document, `video-thumb-${item.id}.jpg`);
        if (target.exists) target.delete();
        new File(result.uri).move(target);
        thumbnailCache.set(item.id, target.uri);
        writeJson(THUMBS_KEY, Object.fromEntries(thumbnailCache));
        if (!cancelled) setUri(target.uri);
      } catch {
        // Leave the plain tile.
      } finally {
        releaseSlot();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, uri, item.id, item.kind, item.url]);
  return uri;
}
