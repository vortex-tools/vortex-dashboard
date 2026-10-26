/**
 * The API base URL every request goes to.
 *
 * Keyed off DEV rather than MODE. A staging build runs `vite build --mode
 * staging`, which makes MODE 'staging' — a `MODE === 'production'` check
 * would then silently fall through to localhost and the deployed staging
 * site would have no data. DEV is true only under `vite dev`.
 * VITE_API_BASE_URL overrides both, so a deploy can be pointed at a
 * different backend without a code change.
 *
 * Staging only: the navbar's API selector can override it per browser
 * (localStorage), restricted to API_OPTIONS. Production ignores it.
 */
export const IS_STAGING = import.meta.env.VITE_DEPLOY_ENV === 'staging';
/** The testnet.vx.tools build (the main build against the testnet API). */
export const IS_TESTNET_SITE = import.meta.env.VITE_DEPLOY_ENV === 'testnet';

const BUILD_DEFAULT: string =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? 'http://localhost:4000' : 'https://api.vx.tools');

const TESTNET_API = 'https://api.testnet.vx.tools';

export const API_OPTIONS = [
  { label: 'staging', url: 'https://api.staging.vx.tools' },
  { label: 'prod', url: 'https://api.vx.tools' },
  { label: 'testnet', url: TESTNET_API },
  { label: 'local', url: 'http://localhost:4000' }
];

const STORAGE_KEY = 'vx-api-endpoint';

// Choices saved under the APIs' old one-level names (2026-10-17 rename).
const RENAMED: Record<string, string> = {
  'https://api-staging.vx.tools': 'https://api.staging.vx.tools',
  'https://api-testnet.vx.tools': TESTNET_API
};

const readOverride = (): string | null => {
  if (!IS_STAGING) return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const v = saved ? (RENAMED[saved] ?? saved) : null;
    return v && API_OPTIONS.some(o => o.url === v) ? v : null;
  } catch {
    return null;
  }
};

export const API_ENDPOINT: string = readOverride() ?? BUILD_DEFAULT;

// Staging only: tag <html> when the testnet API is selected, so the
// staging build's pink testnet palette applies (vite.config.ts) - from the
// first paint, since this runs at module load.
// The testnet.vx.tools build is always pink.
if (IS_TESTNET_SITE || (IS_STAGING && API_ENDPOINT === TESTNET_API)) {
  try {
    document.documentElement.setAttribute('data-vx-cluster', 'testnet');
  } catch {
    // no DOM (tests / SSR)
  }
}

/**
 * Switch the API and reload: every cached slice belongs to the old
 * backend, so a clean start is simpler than invalidating them all.
 */
export const setApiEndpoint = (url: string) => {
  try {
    if (url === BUILD_DEFAULT) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, url);
  } catch {
    return; // storage blocked: the choice couldn't stick across the reload
  }
  window.location.reload();
};
