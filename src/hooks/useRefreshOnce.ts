import { useEffect, useRef } from 'react';

/**
 * Calls `refresh()` once per unique `key`. Use to force-refresh cached
 * data that becomes stale across page entries — typically current-epoch
 * slices that mutate server-side while the dashboard caches them
 * forever. Pass `undefined` for `key` to defer firing (e.g., while
 * `currentEpoch` is still loading).
 *
 * `refresh` is invoked via a ref so callers don't need to memoize it;
 * only `key` gates whether the effect re-fires.
 */
export default function useRefreshOnce(
  key: string | undefined,
  refresh: () => void
): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (key === undefined) return;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    refreshRef.current();
  }, [key]);
}
