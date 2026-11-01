import FeatherIcon from 'feather-icons-react';
import DelayedSpinner from 'components/common/DelayedSpinner';
import { useEffect } from 'react';
import { Link, useRouteError } from 'react-router';

/** A page's code that's gone: a tab opened before a deploy asks for the
 *  old build's chunk (each name carries a hash, so a deploy removes it).
 *  Chrome, Firefox and Safari word it differently; a lazy page whose import
 *  was swallowed for a reload (main.tsx) resolves to undefined. */
const isStaleChunk = (error: unknown) =>
  /dynamically imported module|Importing a module script failed|module script|Expected the result of a dynamic import|resolves to: undefined/i.test(
    error instanceof Error ? error.message : String(error)
  );

const RELOAD_KEY = 'vx-chunk-reload';

/**
 * A page that threw while rendering: say so inside the layout (the
 * sidebar keeps working) instead of the router's bare developer screen.
 * The error goes to the console for anyone who wants it.
 */
const RouteError = () => {
  const error = useRouteError();
  // A new version is out: load it - unless main.tsx's handler already is
  // (a reload asked for in the last seconds), or one ran in the last
  // minute (then a chunk is really missing: show the error, don't loop).
  const plan = isStaleChunk(error) ? reloadPlan() : 'none';
  useEffect(() => {
    if (plan === 'reload') {
      try {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        // ignore
      }
      window.location.reload();
    } else if (plan === 'none' || plan === 'give-up') console.error(error);
  }, [error, plan]);
  const reloading = plan === 'reload' || plan === 'pending';
  if (reloading)
    return (
      <div className="pt-4" style={{ minHeight: '100vh' }}>
        <DelayedSpinner loading label="Loading the new version…" />
      </div>
    );
  return (
    <div className="d-flex flex-column align-items-start gap-3 bg-body-emphasis rounded border border-translucent p-4 my-4">
      <div className="d-flex align-items-center gap-2">
        <FeatherIcon icon="alert-triangle" size={18} className="text-warning" />
        <h5 className="mb-0">This page hit an error</h5>
      </div>
      <p className="fs-9 text-body-secondary mb-0">
        Something on it failed to render. Reloading usually fixes it; if it
        keeps happening, let us know which page.
      </p>
      <div className="d-flex gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
        <Link to="/" className="btn btn-soft-secondary btn-sm">
          Home
        </Link>
      </div>
    </div>
  );
};

/** What a stale chunk calls for: a reload; nothing, one is already
 *  under way in this load; or showing the error (one ran within the
 *  minute, so reloading didn't help). */
const reloadPlan = (): 'reload' | 'pending' | 'give-up' => {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  } catch {
    // storage blocked: reload
  }
  // This load is already reloading (main.tsx's handler).
  if ((window as { vxReloading?: boolean }).vxReloading) return 'pending';
  return Date.now() - last < 60_000 ? 'give-up' : 'reload';
};

export default RouteError;
