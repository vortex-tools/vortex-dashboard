import React from 'react';
import ReactDOM from 'react-dom/client';
import AppProvider from 'providers/AppProvider';
import { RouterProvider } from 'react-router';
import { router } from 'Routes';
import { VortexDataProvider } from 'providers/VortexDataProvider';
import { IS_MOCK_API } from 'helpers/apiEndpoint';
// Nunito Sans, self-hosted (was Google Fonts): no third-party round trips
// before text can render, and font-display: swap.
import '@fontsource/nunito-sans/300.css';
import '@fontsource/nunito-sans/400.css';
import '@fontsource/nunito-sans/600.css';
import '@fontsource/nunito-sans/700.css';
import '@fontsource/nunito-sans/800.css';
import '@fontsource/nunito-sans/900.css';
import 'assets/scss/theme.scss';
import 'assets/scss/user.scss';

// After a deploy, a tab opened before it still asks for the old build's
// on-demand chunks (the world map), which are gone: the SPA fallback answers
// with index.html and the import fails ("Expected a JavaScript-or-Wasm
// module script ... MIME type text/html"). Reload once to pick up the new
// build; the guard stops a loop if a chunk is really missing.
const RELOAD_KEY = 'vx-chunk-reload';
window.addEventListener('vite:preloadError', event => {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  } catch {
    // storage blocked: reload anyway, at most once per load
  }
  if (Date.now() - last < 60_000) return;
  event.preventDefault();
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // ignore
  }
  window.location.reload();
});

const render = () =>
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <AppProvider>
        <VortexDataProvider>
          <RouterProvider router={router} />
        </VortexDataProvider>
      </AppProvider>
    </React.StrictMode>
  );

// Staging's "mock" API: install the mocked routes before the first request.
// The import is dead code outside staging builds, so it's tree-shaken.
// (The env check must be inline - a constant imported from another module
// doesn't let the bundler drop the chunk.)
if (import.meta.env.VITE_DEPLOY_ENV === 'staging' && IS_MOCK_API)
  import('mock')
    .then(m => m.install())
    .catch(() => {})
    .finally(render);
else render();
