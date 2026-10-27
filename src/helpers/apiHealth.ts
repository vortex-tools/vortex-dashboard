import { API_ENDPOINT } from 'helpers/apiEndpoint';
import { useSyncExternalStore } from 'react';

/**
 * Whether the Vortex API is reachable, from every request's outcome: a
 * network error, a timeout or a gateway error (the API restarting, or down)
 * marks it down; any answer marks it up again. While it's down a probe
 * (/epochs/current) watches for it to come back, backing off exponentially
 * (2 s, 4 s, 8 s ... capped at 60 s), and onApiRecovered listeners - the
 * data slices - re-run what failed.
 */

export interface ApiHealth {
  down: boolean;
  /** When it went down (ms), or null. */
  since: number | null;
  /** When the next probe runs (ms), or null while one is in flight. */
  nextRetryAt: number | null;
}

const FIRST_PROBE_MS = 2_000;
const MAX_PROBE_MS = 60_000;

let state: ApiHealth = { down: false, since: null, nextRetryAt: null };
const listeners = new Set<() => void>();
const recovered = new Set<() => void>();
let probe: ReturnType<typeof setTimeout> | null = null;
let delay = FIRST_PROBE_MS;

const set = (next: ApiHealth) => {
  state = next;
  listeners.forEach(l => l());
};

/** A failure that says the API can't be reached - not an answer it gave
 *  (a 400 / 404 / 500 from the API itself, or a response that failed
 *  validation). */
export const isUnreachable = (err: unknown): boolean => {
  const e = err as {
    isAxiosError?: boolean;
    response?: { status?: number };
    name?: string;
    status?: number;
  };
  // A request canceled on purpose (a page unmounting) says nothing.
  if ((err as { code?: string })?.code === 'ERR_CANCELED') return false;
  if (e?.isAxiosError) {
    const status = e.response?.status;
    return (
      status == null ||
      status === 502 ||
      status === 503 ||
      status === 504 ||
      (status >= 520 && status <= 530)
    );
  }
  // fetch: a network error or an aborted (timed-out) request.
  return (
    e?.name === 'TypeError' ||
    e?.name === 'TimeoutError' ||
    e?.name === 'AbortError'
  );
};

const schedule = (ms: number) => {
  if (probe) clearTimeout(probe);
  probe = setTimeout(runProbe, ms);
  set({ ...state, nextRetryAt: Date.now() + ms });
};

const runProbe = () => {
  probe = null;
  set({ ...state, nextRetryAt: null });
  fetch(`${API_ENDPOINT}/epochs/current`, {
    signal: AbortSignal.timeout(8_000)
  })
    .then(res => {
      if (!res.ok) throw new Error(String(res.status));
      noteApiSuccess();
    })
    .catch(() => {
      if (!state.down) return;
      delay = Math.min(delay * 2, MAX_PROBE_MS);
      schedule(delay);
    });
};

export const noteApiFailure = (err: unknown) => {
  if (!isUnreachable(err) || state.down) return;
  state = { down: true, since: Date.now(), nextRetryAt: null };
  delay = FIRST_PROBE_MS;
  schedule(delay);
};

/** Probe now instead of waiting out the backoff. */
export const retryApiNow = () => {
  if (!state.down || probe == null) return;
  clearTimeout(probe);
  runProbe();
};

// Back from a hidden tab, a sleeping machine or a dropped connection:
// check now rather than waiting out the backoff.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => retryApiNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') retryApiNow();
  });
}

export const noteApiSuccess = () => {
  if (!state.down) return;
  if (probe) clearTimeout(probe);
  probe = null;
  set({ down: false, since: null, nextRetryAt: null });
  recovered.forEach(r => r());
};

/** Called each time the API comes back. Returns the unsubscribe. */
export const onApiRecovered = (cb: () => void) => {
  recovered.add(cb);
  return () => {
    recovered.delete(cb);
  };
};

/** A failure worth retrying by itself: unreachable, or any 5xx (a
 *  restarting API answers some requests with 500 before others). */
export const isTransient = (err: unknown): boolean => {
  if (isUnreachable(err)) return true;
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status != null && status >= 500;
};

/** Whether to re-run a failed request once the API is back: it couldn't
 *  reach the API, or it failed while the API was down (a restarting API
 *  can answer 500 before it stops answering at all). */
export const retryOnRecovery = (err: unknown) =>
  isUnreachable(err) || state.down;

export const useApiHealth = (): ApiHealth =>
  useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state
  );
