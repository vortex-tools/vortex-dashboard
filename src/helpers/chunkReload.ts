/**
 * Reloading into a new build after a deploy. A tab opened before it asks
 * for the old build's chunks, which are gone (the SPA fallback answers
 * them with index.html, so the import fails). And for a short while after
 * a deploy, a fresh page can still be answered by an edge that hasn't got
 * the new build yet. So: reload, and if that lands in the same gap, reload
 * again a little later - a few times, spaced out - before giving up and
 * showing the error (a chunk really missing must not loop).
 */

const KEY = 'vx-chunk-reload';
/** Delay before each reload: at once, then after the deploy settles. */
const DELAYS_MS = [0, 3_000, 10_000];
/** Attempts further apart than this start over. */
const WINDOW_MS = 2 * 60_000;

type Attempts = { first: number; count: number };

const read = (): Attempts => {
  try {
    const a = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Attempts;
    if (a && Date.now() - a.first < WINDOW_MS) return a;
  } catch {
    // storage blocked or an old value: start over
  }
  return { first: Date.now(), count: 0 };
};

/** Whether this load is already reloading (by either handler). */
export const reloadPending = () =>
  !!(window as { vxReloading?: boolean }).vxReloading;

/**
 * Reload into the new build, after the next attempt's delay. false: out of
 * attempts (show the error).
 */
export const reloadForNewBuild = (): boolean => {
  if (reloadPending()) return true;
  const a = read();
  if (a.count >= DELAYS_MS.length) return false;
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ first: a.first, count: a.count + 1 })
    );
  } catch {
    // storage blocked: this load reloads once, at most
  }
  (window as { vxReloading?: boolean }).vxReloading = true;
  setTimeout(() => window.location.reload(), DELAYS_MS[a.count]);
  return true;
};

/** A load that has run this long without a stale chunk landed on a
 *  working build: the next deploy starts its tries afresh (at once,
 *  not after the last try's delay). */
const SETTLED_MS = 30_000;
export const settleAfterBoot = () =>
  setTimeout(() => {
    if (reloadPending()) return;
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  }, SETTLED_MS);

/** A page's code that's gone. Chrome, Firefox and Safari word it
 *  differently; a lazy page whose import was swallowed for a reload
 *  (main.tsx) resolves to undefined - React.lazy says so, React Router's
 *  lazy reads its .default and throws. */
export const isStaleChunk = (error: unknown) =>
  /dynamically imported module|Importing a module script failed|module script|Expected the result of a dynamic import|resolves to: undefined|reading 'default'/i.test(
    error instanceof Error ? error.message : String(error)
  );
