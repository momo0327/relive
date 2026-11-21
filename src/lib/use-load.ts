import { useFocusEffect } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { friendlyError } from './errors';

/**
 * Loads data when the screen gains focus; keeps showing old data while
 * refreshing. Focus refreshes are silent; `refreshing` is only true for
 * user-initiated reloads (pull to refresh, retry), so no spinner flashes when
 * returning to a screen.
 */
/** Long enough for a screen transition to finish. */
const REFOCUS_DELAY_MS = 650;

export function useLoad<T>(
  load: () => Promise<T>,
  options: { refocusAfterMs?: number; /** Reload on focus anyway when this returns true. */ stale?: () => boolean } = {},
) {
  const lastLoaded = useRef(0);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });

  const run = useCallback(async (silent: boolean) => {
    if (!silent) setRefreshing(true);
    try {
      setData(await loadRef.current());
      setError(null);
      lastLoaded.current = Date.now();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, []);

  const reload = useCallback(() => run(false), [run]);
  /** Refresh without the pull-to-refresh spinner (background updates). */
  const refresh = useCallback(() => run(true), [run]);

  // On focus, refresh silently, unless it was loaded very recently (e.g.
  // coming back from the photo viewer), which would only re-render for nothing.
  const refocusAfterMs = options.refocusAfterMs ?? 0;
  const staleRef = useRef(options.stale);
  useLayoutEffect(() => {
    staleRef.current = options.stale;
  });
  useFocusEffect(
    useCallback(() => {
      const forced = staleRef.current?.() ?? false;
      if (!forced && lastLoaded.current && Date.now() - lastLoaded.current < refocusAfterMs) return;
      // First load right away; refreshes on returning to a screen wait until the
      // transition back (e.g. a card zooming home) has finished, so the page
      // doesn't re-lay out underneath the animation.
      if (!lastLoaded.current) {
        run(true);
        return;
      }
      const timer = setTimeout(() => run(true), REFOCUS_DELAY_MS);
      return () => clearTimeout(timer);
    }, [run, refocusAfterMs]),
  );

  return { data, error, refreshing, reload, refresh, setData };
}
