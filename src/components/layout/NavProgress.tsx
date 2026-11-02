import { useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';

// Where the router is going, outside React's transition: the router holds
// the old page on screen while a new page's code downloads, so what's
// rendered lags the navigation. Routes.tsx reports each one here.
let target: string | null = null;
const listeners = new Set<() => void>();
export const reportNavigation = (key: string) => {
  if (key === target) return;
  target = key;
  listeners.forEach(l => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * A thin bar under the top bar from the moment a navigation starts until
 * the new page is on screen - for a page whose code is still downloading
 * (most are prefetched, so it rarely shows).
 */
const NavProgress = () => {
  const going = useSyncExternalStore(subscribe, () => target);
  const shown = useLocation().key;
  if (!going || going === shown) return null;
  return (
    <div
      className="vx-nav-progress"
      role="progressbar"
      aria-label="Loading the page"
    />
  );
};

export default NavProgress;
