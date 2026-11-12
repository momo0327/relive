import { useFocusEffect } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { friendlyError } from './errors';

/**
 * Loads data when the screen gains focus; keeps showing old data while
 * refreshing. Focus refreshes are silent; `refreshing` is only true for
 * user-initiated reloads (pull to refresh, retry), so no spinner flashes when
 * returning to a screen.
 */
export function useLoad<T>(load: () => Promise<T>, options: { refocusAfterMs?: number } = {}) {
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

  // On focus, refresh silently, unless it was loaded very recently (e.g.
  // coming back from the photo viewer), which would only re-render for nothing.
  const refocusAfterMs = options.refocusAfterMs ?? 0;
  useFocusEffect(
    useCallback(() => {
      if (lastLoaded.current && Date.now() - lastLoaded.current < refocusAfterMs) return;
      run(true);
    }, [run, refocusAfterMs]),
  );

  return { data, error, refreshing, reload, setData };
}
