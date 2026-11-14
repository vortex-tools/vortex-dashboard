// API request audit: loads each page fresh against the staging API and
// lists the requests it makes - how many, how many to the same endpoint
// (a per-key fan-out), duplicates, and when the last one finished - and
// flags a page over its budget. Run it after adding or changing a page,
// as with scripts/audit-placeholders.mjs.
//
// Usage (npm run build -- --mode staging && npx vite preview --port 3021;
// PLAYWRIGHT_BROWSERS_PATH set):
//   node scripts/audit-requests.mjs '/,/validators,/validator/<id>/staging'
//   node scripts/audit-requests.mjs all      # the PAGES list below
//
// Budget: at most MAX_REQUESTS (16) requests on load, at most MAX_SAME to any
// one endpoint (a fan-out over epochs or keys wants a bulk endpoint), and
// no exact duplicates.

import { chromium } from 'playwright';

// Distinct requests in parallel (a card each) are fine; the budget catches
// pages that pile up. Fan-outs and duplicates are the real smells.
const MAX_REQUESTS = 16;
const MAX_SAME = 4;
const SETTLE_MS = 8000;
// Requests started this long after load are polling (live pages): listed
// apart, not counted against the budget.
const LOAD_MS = 3000;
// A production build (vite preview), not the dev server: React's
// StrictMode runs effects twice in dev, which would read as duplicates.
const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3021';
const API = /api\.staging\.vx\.tools/;

const V = 'CcaHc2L43ZWjwCHART3oZoJvHLAe9hzT2DJNUpBzoTN1';
const PAGES = [
  '/',
  '/validators',
  `/validator/${V}`,
  `/validator/${V}/voting`,
  `/validator/${V}/production`,
  `/validator/${V}/network`,
  `/validator/${V}/earnings`,
  `/validator/${V}/fees`,
  `/validator/${V}/staking`,
  '/leaderboards/consensus',
  '/leaderboards/fees',
  '/status',
  '/client-versions',
  '/decentralization',
  '/providers',
  '/pools',
  '/pool/JitoSOL',
  '/activity',
  '/features',
  '/governance',
  '/block-builders',
  '/replay'
];

const arg = process.argv[2] ?? 'all';
const pages = arg === 'all' ? PAGES : arg.split(',');
const b = await chromium.launch();
let bad = 0;
for (const path of pages) {
  const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } });
  await ctx.addInitScript(
    a => localStorage.setItem('vx-api-endpoint', a),
    'https://api.staging.vx.tools'
  );
  const reqs = [];
  const t0 = Date.now();
  await ctx.route(API, async r => {
    const u = new URL(r.request().url());
    const rec = { path: u.pathname, q: u.search, start: Date.now() - t0 };
    reqs.push(rec);
    try {
      const res = await r.fetch({ timeout: 60000 });
      const body = await res.body();
      rec.end = Date.now() - t0;
      await r.fulfill({
        status: res.status(),
        headers: { ...res.headers(), 'access-control-allow-origin': '*' },
        body
      });
    } catch {
      rec.end = Date.now() - t0;
      r.abort().catch(() => {});
    }
  });
  const p = await ctx.newPage();
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForTimeout(SETTLE_MS);
  await ctx.close();

  const polls = reqs.filter(r => r.start > LOAD_MS);
  const load = reqs.filter(r => r.start <= LOAD_MS);
  const byPath = new Map();
  for (const r of load) byPath.set(r.path, (byPath.get(r.path) ?? 0) + 1);
  // A duplicate: the same request again within a second (later repeats
  // are a page polling).
  const dups = load
    .filter((r, i) =>
      load.some(
        (o, j) =>
          j < i && o.path + o.q === r.path + r.q && r.start - o.start < 1000
      )
    )
    .map(r => r.path + r.q.slice(0, 40));
  const fanout = [...byPath].filter(([, n]) => n > MAX_SAME);
  const last = Math.max(0, ...load.map(r => r.end ?? 0));
  const problems = [
    load.length > MAX_REQUESTS && `${load.length} requests`,
    ...fanout.map(([k, n]) => `${n}x ${k}`),
    dups.length &&
      `${dups.length} duplicate(s): ${[...new Set(dups)].join(' ')}`
  ].filter(Boolean);
  if (problems.length) bad++;
  console.log(
    `${problems.length ? 'BAD' : 'OK '} ${path}  ${load.length} req, last at ${last} ms` +
      (polls.length
        ? ` (+${polls.length} polling: ${[...new Set(polls.map(r => r.path))].join(' ')})`
        : '') +
      (problems.length ? `\n    ${problems.join('\n    ')}` : '')
  );
}
await b.close();
process.exit(bad ? 1 : 0);
