// Loading-placeholder audit: measures each page's cards (kind, width, position,
// height) loaded, with the API held (the page's own placeholders) and with the
// page's chunk held (MainLayout's fallback), as JSON for
// scripts/audit-placeholders-cmp.py to compare.
//
// Usage (dev server on :3020, staging mode; PLAYWRIGHT_BROWSERS_PATH set):
//   node scripts/audit-placeholders.mjs loaded '/validator/<id>,/status' > L.json
//   node scripts/audit-placeholders.mjs api    '...' > A.json
//   node scripts/audit-placeholders.mjs chunk  '...' > C.json
//   python3 scripts/audit-placeholders-cmp.py L.json A.json api
// Use canonical paths (redirects keep the old screen while a chunk loads).

import { chromium } from 'playwright';
const mode = process.argv[2]; // 'loaded' | 'api' | 'chunk'
const pages = process.argv[3].split(',');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 1000 } });
let holdApi = mode === 'api', holdChunk = mode === 'chunk';
await p.route('https://api.staging.vx.tools/**', async r => { while (holdApi) await new Promise(s => setTimeout(s, 200)); try { const res = await r.fetch({ headers: { ...r.request().headers(), origin: 'https://staging.vx.tools' } }); await r.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } }); } catch {} });
const OTHER = [[/^\/status/, 'LiveConsensus'], [/^\/slot\//, 'SlotPage'], [/^\/leaderboards\/consensus/, 'ConsensusLeaderboard'], [/^\/leaderboards\/fees/, 'IncomeLeaderboard'], [/^\/leaderboards\/voting\/?$/, 'VotingLeaderboard'], [/^\/validators/, 'Validators'], [/^\/decentralization/, 'Decentralization'], [/^\/block-builders/, 'BlockBuilders'], [/^\/client-versions/, 'ClientVersions'], [/^\/features/, 'FeatureGates'], [/^\/feature\//, 'FeatureGatePage'], [/^\/simds/, 'Simds'], [/^\/simd\//, 'SimdPage'], [/^\/pools/, 'StakePools'], [/^\/pool\//, 'StakePool'], [/^\/activity/, 'Activity'], [/^\/governance\/?$/, 'Governance'], [/^\/governance\//, 'GovernanceProposal']];
const PAGE = { '': 'ValidatorOverview', voting: 'ValidatorDivergentVotes', production: 'ValidatorProducedBlocks', network: 'ValidatorNetwork', earnings: 'ValidatorEarningsTab', 'block-income': 'ValidatorFees', fees: 'ValidatorFees', staking: 'ValidatorStaking' };
let held = null;
await p.route(/\/src\/pages\/[A-Za-z]+\.tsx/, async r => { const f = r.request().url().match(/pages\/([A-Za-z]+)\.tsx/)[1]; while (holdChunk && f === held) await new Promise(s => setTimeout(s, 200)); await r.continue(); });
const measure = () => p.evaluate(() => {
  const main = document.querySelector('main.content') || document.body;
  const all = [...main.querySelectorAll('.section-card, .stat-card, [data-skeleton], .border.rounded')].filter(e => !e.closest('footer') && e.getBoundingClientRect().height > 30 && !e.closest('.validator-title'));
  const tops = all.filter(e => !all.some(o => o !== e && o.contains(e)));
  const x0 = main.querySelector('.validator-title, .page-header, h1')?.getBoundingClientRect().left ?? 0;
  return tops.map(e => {
    const r = e.getBoundingClientRect();
    const k = e.dataset.skeleton ?? (e.classList.contains('stat-card') ? 'stat' : e.querySelector('table, [data-skeleton-table]') ? 'table' : e.querySelector('canvas') ? 'chart' : 'block');
    const t = (e.querySelector('h6')?.textContent || '').trim().slice(0, 22);
    return { k, x: Math.round(r.left - x0), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height), t };
  }).sort((a, b) => a.y - b.y || a.x - b.x);
});
const out = {};
for (const u of pages) {
  holdApi = mode === 'api'; holdChunk = mode === 'chunk';
  const m = u.match(/^\/validator\/[^/]+(?:\/([^/]+))?/); held = m ? PAGE[m[1] ?? ''] : (OTHER.find(([re]) => re.test(u))?.[1] ?? null);
  // A fresh page per URL so chunks aren't cached across.
  await p.goto('about:blank');
  await p.goto('http://localhost:3020' + u, { waitUntil: 'commit' }).catch(() => {});
  await p.waitForTimeout(mode === 'loaded' ? 10000 : 3500);
  out[u] = await measure();
  if (process.env.SHOT) await p.screenshot({ path: 'audit-' + mode + u.replace(/\W+/g, '_').slice(-20) + '.png' });
}
console.log(JSON.stringify(out));
holdApi = holdChunk = false;
await p.unrouteAll({ behavior: 'ignoreErrors' }); await b.close();
