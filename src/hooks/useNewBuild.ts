import useLiveRefresh from 'hooks/useLiveRefresh';
import { useState } from 'react';

/** How often to look for a newer deploy. */
const CHECK_MS = 60_000;

/**
 * A newer deploy than the one running: the page's HTML is fetched (no
 * cache) every minute while the tab is visible, and its build stamp
 * (vite.config's <meta name="vx-build">) compared with this build's.
 * null while it's the same (or it couldn't tell).
 */
const useNewBuild = (enabled = true): string | null => {
  const [next, setNext] = useState<string | null>(null);
  useLiveRefresh(enabled && !next, CHECK_MS, () => {
    fetch('/', { cache: 'no-store' })
      .then(r => (r.ok ? r.text() : ''))
      .then(html => {
        const sha = html.match(
          /<meta name="vx-build" content="([0-9a-f]+)"/i
        )?.[1];
        if (sha && !__VX_BUILD__.startsWith(sha)) setNext(sha);
      })
      .catch(() => undefined);
  });
  return next;
};

export default useNewBuild;
