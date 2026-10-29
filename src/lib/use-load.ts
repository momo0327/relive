import { useFocusEffect } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { friendlyError } from './errors';

/**
 * Loads data when the screen gains focus; keeps showing old data while
 * refreshing. Focus refreshes are silent; `refreshing` is only true for
 * user-initiated reloads (pull to refresh, retry), so no spinner flashes when
 * returning to a screen.
 */
export function useLoad<T>(load: () => Promise<T>) {
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
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, []);

  const reload = useCallback(() => run(false), [run]);

  useFocusEffect(
    useCallback(() => {
      run(true);
    }, [run]),
  );

  return { data, error, refreshing, reload, setData };
}
