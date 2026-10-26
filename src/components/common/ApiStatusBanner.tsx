import FeatherIcon from 'feather-icons-react';
import { retryApiNow, useApiHealth } from 'helpers/apiHealth';
import { useEffect, useState } from 'react';

/** Outages shorter than this (one dropped request) aren't announced. */
const SHOW_AFTER_MS = 2_000;

/**
 * Says so when the API can't be reached (restarting, or down), above every
 * page, with a countdown to the next (backed-off) retry and a button to
 * retry now. What failed meanwhile is fetched again once it answers, so
 * the page fills in by itself.
 */
const ApiStatusBanner = () => {
  const { down, since, nextRetryAt } = useApiHealth();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!down) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [down]);
  if (!down || since == null || now - since < SHOW_AFTER_MS) return null;
  const secs =
    nextRetryAt == null
      ? null
      : Math.max(0, Math.ceil((nextRetryAt - now) / 1000));
  return (
    <div role="status" aria-live="polite" className="api-status-bar fs-9">
      <FeatherIcon
        icon="wifi-off"
        size={14}
        className="me-2 flex-shrink-0 text-warning"
      />
      <span>
        Can&apos;t reach the Vortex API - it may be restarting.{' '}
        {secs == null || secs === 0 ? 'Retrying…' : `Retrying in ${secs} s.`}{' '}
        The page fills in when it&apos;s back.
        {secs != null && secs > 0 && (
          <button
            type="button"
            className="btn btn-link p-0 ms-2 fs-9 align-baseline"
            onClick={retryApiNow}
          >
            Retry now
          </button>
        )}
      </span>
    </div>
  );
};

export default ApiStatusBanner;
