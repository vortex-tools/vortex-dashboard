import { useEffect, useRef } from 'react';

/**
 * Keeps in-progress-epoch data from going stale on a page that would
 * otherwise fetch once and never look again.
 *
 * While `enabled`, calls `refresh()` every `intervalMs` — but only while the
 * tab is actually visible, so a backgrounded dashboard doesn't poll — and
 * once immediately whenever the tab goes from hidden back to visible.
 *
 * The provider's cache has no TTL: whatever snapshot a page fetches on entry
 * is what it renders for the rest of the session. For the current epoch that
 * snapshot is a moving target, so a value that was merely *momentarily* wrong
 * server-side (e.g. a validator's vote record trailing the cluster's by one
 * 1000-slot bucket, which reads as 1000 skipped slots) would otherwise stay
 * on screen long after the server had corrected it.
 *
 * `refresh` is invoked via a ref, so callers don't need to memoize it; only
 * `enabled` and `intervalMs` re-arm the timer.
 */
export default function useLiveRefresh(
  enabled: boolean,
  intervalMs: number,
  refresh: () => void
): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) return;

    const isVisible = () => document.visibilityState !== 'hidden';

    const id = setInterval(() => {
      if (isVisible()) refreshRef.current();
    }, intervalMs);

    // Coming back to a tab that has been parked for a while is exactly when
    // the on-screen numbers are most likely to be stale — refresh right away
    // rather than waiting out the rest of the interval.
    const onVisibility = () => {
      if (isVisible()) refreshRef.current();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, intervalMs]);
}
