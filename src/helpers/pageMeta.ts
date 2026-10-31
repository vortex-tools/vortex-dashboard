/**
 * Each page's title, description, canonical URL and breadcrumbs - no
 * imports, so the Worker (worker/seo.ts: tags crawlers get on first load)
 * and the app (hooks/usePageMeta: the title as you navigate) build them
 * the same way.
 */

/** The deploy (wrangler.jsonc vars; the app passes its own). */
export interface Site {
  CLUSTER: string;
  /** "production" | "staging" | "testnet". */
  SITE?: string;
}

export const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const indexable = (env: Site) => env.SITE !== 'staging';
export const isTestnet = (env: Site) => env.CLUSTER === 'testnet';
export const brand = (env: Site) =>
  env.SITE === 'staging'
    ? 'Vortex Staging'
    : isTestnet(env)
      ? 'Vortex Testnet'
      : 'Vortex';
/** "Solana" or "Solana testnet", for copy. */
export const solana = (env: Site) =>
  isTestnet(env) ? 'Solana testnet' : 'Solana';

// ---------------------------------------------------------------- routes

export interface Crumb {
  name: string;
  path: string;
}

export interface Meta {
  title: string;
  description: string;
  /** Path (and query, if it selects different content) of the canonical URL. */
  canonical: string;
  /** Visible heading of the summary; defaults to the title sans brand. */
  h1?: string;
  crumbs?: Crumb[];
  /** Extra links for the summary (a validator's tabs, say). */
  links?: Crumb[];
  /** Extra summary paragraphs (plain text). */
  facts?: string[];
  noindex?: boolean;
  status?: number;
}

export const HOME: Crumb = { name: 'Home', path: '/' };

/** The main sections, linked from every summary. */
export const sections = (env: Site): Crumb[] => [
  { name: 'Consensus leaderboard', path: '/leaderboards/consensus' },
  ...(isTestnet(env)
    ? []
    : [{ name: 'Block income leaderboard', path: '/leaderboards/fees' }]),
  { name: 'Validators', path: '/validators' },
  { name: 'Stake pools', path: '/pools' },
  { name: 'Decentralization', path: '/decentralization' },
  { name: 'Client versions', path: '/client-versions' },
  { name: 'Cluster status', path: '/status' },
  { name: 'Governance', path: '/governance' },
  { name: 'Feature gates', path: '/features' },
  { name: 'SIMDs', path: '/simds' },
  { name: 'Activity', path: '/activity' },
  { name: 'API and AI usage', path: '/usage' }
];

/** Fixed pages: [title, description, crumb name]. */
export const STATIC: Record<string, (env: Site) => [string, string, string]> = {
  '/': env => [
    `${solana(env)} validator data under Alpenglow`,
    `How ${solana(env)} validators perform under Alpenglow consensus: vote participation, block production, block income, earnings, stake, decentralization and governance, per validator and per epoch. Free, no account, with a public API.`,
    'Home'
  ],
  '/leaderboards/consensus': env => [
    `${solana(env)} validator leaderboard: Alpenglow voting and block production`,
    `Every ${solana(env)} validator ranked on Alpenglow consensus: vote participation and block production for the current epoch and past ones.`,
    'Consensus leaderboard'
  ],
  '/leaderboards/fees': env => [
    `${solana(env)} block income leaderboard: fees and tips per block`,
    `${solana(env)} validators ranked by block income: base fees, priority fees and tips per block, compared with the blocks other leaders made around them, and what skipped slots cost.`,
    'Block income leaderboard'
  ],
  '/leaderboards/voting': env => [
    `${solana(env)} TowerBFT voting leaderboards (historical)`,
    `Per-epoch voting leaderboards from ${solana(env)}'s TowerBFT era, before Alpenglow: vote accuracy and latency per validator.`,
    'Voting (Tower)'
  ],
  '/leaderboards/voting/compare': env => [
    `Compare two ${solana(env)} validators' TowerBFT voting`,
    `Two ${solana(env)} validators side by side on TowerBFT-era voting: rank, missed votes and missed slots per epoch.`,
    'Compare'
  ],
  '/validators': env => [
    `All ${solana(env)} validators: status, stake, client and location`,
    `Every staked ${solana(env)} validator's operational status: stake, client and version, location and data center, check verdicts and SFDP status.`,
    'Validators'
  ],
  '/decentralization': env => [
    `${solana(env)} decentralization: Nakamoto coefficients`,
    `How decentralized ${solana(env)} is: Nakamoto coefficients by validator, hosting provider, provider and city, country and client, with each breakdown's history.`,
    'Decentralization'
  ],
  '/client-versions': env => [
    `${solana(env)} client versions: Agave, Firedancer and Jito adoption`,
    `Which client and version every ${solana(env)} validator runs, by stake: how far each client's validators have upgraded.`,
    'Client versions'
  ],
  '/features': env => [
    `${solana(env)} feature gates: activation status`,
    `Every ${solana(env)} feature gate: pending, scheduled and activated features, with the epoch each one activated.`,
    'Feature gates'
  ],
  '/simds': env => [
    `SIMDs: Solana Improvement Documents and their status`,
    `Solana Improvement Documents (SIMDs) and how each one relates to ${solana(env)} feature gates and governance votes.`,
    'SIMDs'
  ],
  '/pools': env => [
    `${solana(env)} stake pools: stake and validators per pool`,
    `Every ${solana(env)} stake pool, Marinade and the Solana Foundation Delegation Program: how much stake each holds, on how many validators, and which validators it added or dropped.`,
    'Stake pools'
  ],
  '/activity': env => [
    `${solana(env)} validator activity: vote account changes`,
    `Recent ${solana(env)} vote account changes: commission changes, identity rotations, new and closed vote accounts.`,
    'Activity'
  ],
  '/governance': env => [
    `${solana(env)} governance proposals and validator votes`,
    `${solana(env)} governance proposals: each one's verdict under its rule, every validator's vote, and stakers' overrides.`,
    'Governance'
  ],
  '/status': env => [
    `${solana(env)} cluster status: live Alpenglow slots and finality`,
    `What ${solana(env)} is doing now: the latest slots as they happen under Alpenglow, finality, and any halt and restart.`,
    'Cluster status'
  ],
  '/usage': env => [
    `Vortex API for developers and AI agents`,
    `Query ${solana(env)} validator data from your code or AI assistant: the free, read-only Vortex API and its llms.txt reference.`,
    'API and AI usage'
  ]
};

/** First path segments the app routes (src/Routes.tsx); anything else 404s.
 *  Keep in step when adding a top-level route. */
export const KNOWN_SECTIONS = new Set([
  '',
  'leaderboards',
  'validators',
  'decentralization',
  'client-versions',
  'cluster-health',
  'features',
  'feature',
  'simds',
  'simd',
  'pools',
  'pool',
  'activity',
  'vote-account-changes',
  'governance',
  'alpenglow',
  'status',
  'live',
  'slot',
  'usage',
  'validator',
  'cluster',
  'vote-stats',
  'vote-history',
  'income'
]);

/** Renamed pages (the app redirects these client-side too). */
export const MOVED: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^\/leaderboards\/(block-income|income)\/?$/, () => '/leaderboards/fees'],
  [/^\/leaderboards\/production\/?$/, () => '/leaderboards/consensus'],
  [/^\/cluster\/vote-stats\/?$/, () => '/leaderboards/voting'],
  [
    /^\/cluster\/vote-stats\/epoch\/(\d+)\/?$/,
    m => `/leaderboards/voting/epoch/${m[1]}`
  ],
  [/^\/cluster\/income\/?$/, () => '/leaderboards/fees'],
  [/^\/live\/?$/, () => '/status'],
  [/^\/cluster-health\/?$/, () => '/client-versions'],
  [/^\/alpenglow(\/.*)?$/, () => '/'],
  [
    /^\/validator\/([^/]+)\/(block-income|income)\/?$/,
    m => `/validator/${m[1]}/fees`
  ],
  [/^\/income\/([^/]+)\/?$/, m => `/validator/${m[1]}/fees`]
];

// ------------------------------------------------------------ validators

/** The /validators/status fields the tags use (the app passes what its
 *  directory knows: no stake, client or location). */
export interface ValidatorStatus {
  identity: string;
  voteAccount: string | null;
  info: { name: string | null } | null;
  geo: { country: string | null; city: string | null } | null;
  software: { clientId: string | null; version: string | null } | null;
  stake: {
    activatedStake: number;
    shareOfTotal: number | null;
    delinquent: boolean;
  } | null;
}

export const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
export const sol = (lamports: number) =>
  Math.round(lamports / 1e9).toLocaleString('en-US');

const VALIDATOR_TABS: Array<{
  seg: string;
  name: string;
  title: (n: string) => string;
  about: string;
  testnet: boolean;
}> = [
  {
    seg: '',
    name: 'Overview',
    title: n => `${n}: Solana validator`,
    about:
      'Alpenglow voting and block production, block income, earnings and stake history',
    testnet: true
  },
  {
    seg: 'voting',
    name: 'Voting',
    title: n => `${n}: Alpenglow voting record`,
    about:
      'its Alpenglow voting record: rewards, votes per slot, divergent votes and misses',
    testnet: true
  },
  {
    seg: 'production',
    name: 'Production',
    title: n => `${n}: block production`,
    about:
      'its block production: rewards, produced and skipped leader slots, and voters its blocks leave out',
    testnet: true
  },
  {
    seg: 'earnings',
    name: 'Earnings',
    title: n => `${n}: earnings and inflation rewards`,
    about: 'its net earnings and inflation rewards per epoch',
    testnet: true
  },
  {
    seg: 'fees',
    name: 'Block income',
    title: n => `${n}: block income, fees and tips`,
    about:
      'its block income: fees and tips per block, capture against nearby leaders, and skipped slots',
    testnet: false
  },
  {
    seg: 'staking',
    name: 'Staking',
    title: n => `${n}: stake changes and pool holdings`,
    about: 'its stake flows, delegator changes and stake pool holdings',
    testnet: false
  },
  {
    seg: 'votes',
    name: 'Tower voting history',
    title: n => `${n}: TowerBFT voting history`,
    about: 'its TowerBFT-era voting history and ranking, before Alpenglow',
    testnet: true
  }
];

/** metaFor's verdicts besides tags: no such page, or a page with the
 *  default tags (old URLs the app redirects, views without tags). */
export const MISSING = 'missing' as const;
export const PASS = 'pass' as const;
export type Verdict = Meta | typeof MISSING | typeof PASS;

const validatorMeta = (
  env: Site,
  address: string,
  rest: string,
  s: ValidatorStatus | null
): Verdict => {
  const parts = rest.split('/').filter(Boolean);
  const seg = parts[0] ?? '';
  // The record's old URLs (/consensus[...]) redirect in the app.
  if (seg === 'consensus') return PASS;
  const tab = VALIDATOR_TABS.find(t => t.seg === seg);
  if (!tab) return MISSING;
  if (!tab.testnet && isTestnet(env)) return PASS;
  // The tabs' epoch views (voting/epoch/N, votes/epoch/N[/bucket/B]).
  const epoch =
    parts[1] === 'epoch' && /^\d+$/.test(parts[2] ?? '') ? parts[2] : null;
  const bucket = epoch && parts[3] === 'bucket' && /^\d+$/.test(parts[4] ?? '');
  if (parts.length > (bucket ? 5 : epoch ? 3 : 1)) return MISSING;
  if (bucket) return PASS;

  const vote = s?.voteAccount ?? address;
  const name = s?.info?.name?.trim() || short(vote);
  const base = `/validator/${vote}`;
  const tabPath = tab.seg ? `${base}/${tab.seg}` : base;
  const facts: string[] = [];
  if (s?.stake) {
    const share =
      s.stake.shareOfTotal != null
        ? ` (${(s.stake.shareOfTotal * 100).toFixed(2)}% of all stake)`
        : '';
    const client = s.software?.clientId
      ? `, running ${s.software.clientId}${s.software.version ? ` ${s.software.version}` : ''}`
      : '';
    const where = s.geo?.country
      ? ` in ${s.geo.city ? `${s.geo.city}, ` : ''}${s.geo.country}`
      : '';
    facts.push(
      `${name} is a ${solana(env)} validator with ${sol(s.stake.activatedStake)} SOL staked${share}${client}${where}.${s.stake.delinquent ? ' It is currently delinquent.' : ''}`
    );
  }
  facts.push(`Identity ${s?.identity ?? 'unknown'}, vote account ${vote}.`);
  const title = tab.title(name) + (epoch ? ` (epoch ${epoch})` : '');
  const description = `${facts[0] ?? `${name} is a ${solana(env)} validator.`} On Vortex: ${tab.about}${epoch ? ` in epoch ${epoch}` : ''}.`;
  return {
    title,
    description,
    canonical: epoch ? `${tabPath}/epoch/${epoch}` : tabPath,
    h1: name,
    facts,
    crumbs: [
      HOME,
      { name: 'Validators', path: '/validators' },
      { name, path: base },
      ...(tab.seg ? [{ name: tab.name, path: tabPath }] : [])
    ],
    links: VALIDATOR_TABS.filter(t => t.testnet || !isTestnet(env)).map(t => ({
      name: `${name}: ${t.name}`,
      path: t.seg ? `${base}/${t.seg}` : base
    })),
    // A key the live directory doesn't know (a validator that left, or a
    // typo) still renders its stored history in the app: keep it out of
    // the index but serve it.
    noindex: !s
  };
};

// ----------------------------------------------------------------- pools

/** The /pool fields the tags use. */
export interface PoolFacts {
  name: string;
  fullName: string | null;
  stake: number;
  info: { description: string | null } | null;
}

const poolMeta = (env: Site, name: string, p: PoolFacts | null): Meta => {
  const label =
    p?.fullName && p.fullName !== p.name
      ? `${p.fullName} (${p.name})`
      : (p?.name ?? name);
  const path = `/pool/${encodeURIComponent(p?.name ?? name)}`;
  const facts = p
    ? [
        `${label} holds ${sol(p.stake)} SOL of ${solana(env)} stake.`,
        ...(p.info?.description ? [p.info.description] : [])
      ]
    : [];
  return {
    title: `${label}: ${solana(env)} stake pool validators and stake`,
    description: `${facts[0] ?? `${label} on ${solana(env)}.`} Every validator it stakes to, and which it added, dropped or moved stake on, per epoch.`,
    canonical: path,
    h1: label,
    facts,
    crumbs: [
      HOME,
      { name: 'Stake pools', path: '/pools' },
      { name: label, path }
    ],
    noindex: !p
  };
};

// ----------------------------------------------------------------- meta

/** What a page needs fetched before its tags can be built. */
export const factsNeeded = (
  pathname: string
): { validator?: string; pool?: string } => {
  let m = pathname.match(/^\/validator\/([^/]+)/);
  if (m && BASE58.test(m[1])) return { validator: m[1] };
  m = pathname.match(/^\/pool\/([^/]+)\/?$/);
  if (m) return { pool: decodeURIComponent(m[1]) };
  return {};
};

/** The page's tags: Meta, MISSING (no such page: 404) or PASS (a page with
 *  the default tags). `facts` holds what factsNeeded asked for (null when
 *  the API doesn't know it). */
export const pageMeta = (
  env: Site,
  pathname: string,
  search: string,
  facts: { validator?: ValidatorStatus | null; pool?: PoolFacts | null }
): Verdict => {
  const path = pathname.replace(/\/+$/, '') || '/';
  const seg = path.split('/');
  if (!KNOWN_SECTIONS.has(seg[1] ?? '')) return MISSING;

  const fixed = STATIC[path];
  if (fixed) {
    if (path === '/leaderboards/fees' && isTestnet(env)) return PASS;
    const [title, description, crumb] = fixed(env);
    // The consensus board's views are different content: keep ?view=.
    const view = new URLSearchParams(search).get('view');
    const canonical =
      path === '/leaderboards/consensus' && view && /^[a-z]+$/.test(view)
        ? `${path}?view=${view}`
        : path;
    return {
      title,
      description,
      canonical,
      crumbs: path === '/' ? undefined : [HOME, { name: crumb, path }]
    };
  }

  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/validator\/([^/]+)(\/.*)?$/))) {
    if (!BASE58.test(m[1])) return MISSING;
    return validatorMeta(env, m[1], m[2] ?? '', facts.validator ?? null);
  }
  if ((m = path.match(/^\/leaderboards\/consensus\/epoch\/(\d+)$/))) {
    const [t, d, c] = STATIC['/leaderboards/consensus'](env);
    return {
      title: `${t}, epoch ${m[1]}`,
      description: `${d.replace(/ for the current epoch and past ones\.$/, '')} in epoch ${m[1]}.`,
      canonical: path,
      crumbs: [
        HOME,
        { name: c, path: '/leaderboards/consensus' },
        { name: `Epoch ${m[1]}`, path }
      ]
    };
  }
  if ((m = path.match(/^\/leaderboards\/voting\/epoch\/(\d+)$/))) {
    return {
      title: `${solana(env)} TowerBFT voting leaderboard, epoch ${m[1]}`,
      description: `Every ${solana(env)} validator's TowerBFT voting in epoch ${m[1]}: vote accuracy and latency, ranked.`,
      canonical: path,
      crumbs: [
        HOME,
        { name: 'Voting (Tower)', path: '/leaderboards/voting' },
        { name: `Epoch ${m[1]}`, path }
      ]
    };
  }
  if ((m = path.match(/^\/pool\/([^/]+)$/)))
    return poolMeta(env, decodeURIComponent(m[1]), facts.pool ?? null);
  if ((m = path.match(/^\/simd\/(\d+)$/))) {
    const n = m[1].padStart(4, '0');
    return {
      title: `SIMD-${n}: status, feature gate and governance`,
      description: `SIMD-${n}: its status, the ${solana(env)} feature gates that implement it, and any governance vote on it.`,
      canonical: path,
      crumbs: [
        HOME,
        { name: 'SIMDs', path: '/simds' },
        { name: `SIMD-${n}`, path }
      ]
    };
  }
  if ((m = path.match(/^\/feature\/([^/]+)$/)) && BASE58.test(m[1])) {
    return {
      title: `${solana(env)} feature gate ${short(m[1])}`,
      description: `${solana(env)} feature gate ${m[1]}: what it changes, its SIMD, and when it was scheduled and activated.`,
      canonical: path,
      crumbs: [
        HOME,
        { name: 'Feature gates', path: '/features' },
        { name: short(m[1]), path }
      ]
    };
  }
  if ((m = path.match(/^\/governance\/([^/]+)$/)) && BASE58.test(m[1])) {
    return {
      title: `${solana(env)} governance proposal ${short(m[1])}`,
      description: `${solana(env)} governance proposal ${m[1]}: its verdict under its rule, every validator's vote, and stakers' overrides.`,
      canonical: path,
      crumbs: [
        HOME,
        { name: 'Governance', path: '/governance' },
        { name: short(m[1]), path }
      ]
    };
  }
  if ((m = path.match(/^\/slot\/(\d+)$/))) {
    return {
      title: `${solana(env)} slot ${m[1]}`,
      description: `What happened in ${solana(env)} slot ${m[1]}: its block or skip, its votes and certificates, and who was left out.`,
      canonical: path
    };
  }
  // A route the app serves that has no tags of its own (legacy redirects
  // handled client-side, detail views): the default tags.
  return PASS;
};
