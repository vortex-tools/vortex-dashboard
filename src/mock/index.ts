/**
 * Staging only: the "mock" API. Requests go to the staging API as usual,
 * except the routes below, which are answered here with generated data -
 * for pages whose endpoints haven't shipped yet. Loaded with a dynamic
 * import from main.tsx only on a staging build with "mock" selected, so
 * none of this reaches production.
 *
 * Add a route: a function of the query string returning the response
 * body (as the API documents it), or null for a 404.
 */
import axios, { AxiosAdapter } from 'axios';
import { API_ENDPOINT } from 'helpers/apiEndpoint';

type Query = URLSearchParams;
type Route = (q: Query) => Promise<unknown | null> | unknown | null;

// ---- helpers ------------------------------------------------------------

/** A repeatable pseudo-random stream per seed (mulberry32). */
const rng = (seed: string) => {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++)
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type Dir = { nodeAddress: string; voteAddress: string; name: string | null };
const realFetch = window.fetch.bind(window);
let dirP: Promise<Dir[]> | null = null;
/** The real validator directory, for names and keys. */
const directory = () =>
  (dirP ??= realFetch(`${API_ENDPOINT}/validators`)
    .then(r => r.json())
    .then(j => (Array.isArray(j) ? j : (j.validators ?? [])) as Dir[])
    .catch(() => []));

// ---- stake pools (/pools, /pool) ----------------------------------------

const POOLS = [
  {
    name: 'SFDP',
    kind: 'sfdp',
    fullName: 'Solana Foundation Delegation Program',
    n: 400,
    stake: 4.2e16
  },
  {
    name: 'Marinade (mSOL)',
    kind: 'marinade',
    fullName: null,
    n: 350,
    stake: 2.3e15
  },
  {
    name: 'Marinade Native',
    kind: 'marinade',
    fullName: null,
    n: 81,
    stake: 3.55e15
  },
  {
    name: 'Marinade Select',
    kind: 'marinade',
    fullName: null,
    n: 64,
    stake: 1.31e15
  },
  {
    name: 'JitoSOL',
    kind: 'stake-pool',
    fullName: 'Jito Staked SOL',
    n: 290,
    stake: 1.4e16
  },
  {
    name: 'bSOL',
    kind: 'stake-pool',
    fullName: 'BlazeStake Staked SOL',
    n: 180,
    stake: 5.2e15
  },
  {
    name: 'hSOL',
    kind: 'stake-pool',
    fullName: 'Helius Staked SOL',
    n: 12,
    stake: 3.5e15
  },
  {
    name: 'tinySOL',
    kind: 'stake-pool',
    fullName: 'Tiny Staked SOL',
    n: 4,
    stake: 1e14
  }
] as const;
const EPOCH = 1069;

/** A pool's fees (none for SFDP); bSOL has a change scheduled. */
const feesOf = (name: string, kind: string) =>
  kind === 'sfdp'
    ? null
    : {
        epochFeeBps:
          name === 'JitoSOL' ? 400 : name.startsWith('Marinade') ? 600 : 500,
        nextEpochFeeBps: name === 'bSOL' ? 300 : null,
        solDepositFeeBps: 0,
        stakeDepositFeeBps: 0,
        solWithdrawalFeeBps: 10,
        stakeWithdrawalFeeBps: 30
      };
const HISTORY = 20;

const poolOf = async (spec: (typeof POOLS)[number]) => {
  const r = rng(spec.name);
  const dir = [...(await directory())].sort(() => r() - 0.5);
  const vs = dir.slice(0, spec.n);
  const w = vs.map((_, i) => 1 / Math.pow(i + 1, 0.9));
  const sw = w.reduce((a, b) => a + b, 0);
  const validators = vs.map((v, i) => {
    const stake = Math.round((spec.stake * w[i]) / sw);
    return {
      voteKey: v.voteAddress,
      identity: v.nodeAddress,
      name: v.name,
      stake,
      shareOfPool: stake / spec.stake,
      shareOfValidator: 0.02 + r() * 0.58,
      stakePrev: i % 17 === 3 ? null : Math.round(stake * (0.95 + r() * 0.09)),
      sfdpStake:
        spec.kind !== 'sfdp' && i % 3 === 0
          ? Math.round(1e14 + r() * 3e14)
          : null,
      otherPools: spec.kind === 'sfdp' ? null : Math.floor(r() * r() * 4),
      otherPoolNames: ['JitoSOL', 'bSOL', 'dzSOL'].slice(0, 2),
      // ~6.8% a year of inflation at ~360 epochs, MEV a third on top.
      inflationReward: Math.round(stake * 0.000185),
      mevReward: Math.round(stake * 0.00006),
      priorityFeeReward: i % 50 === 0 ? Math.round(stake * 0.00001) : null,
      tipRouterFee: Math.round(stake * 0.00006 * 0.0319),
      validatorMevFeeBps: [0, 500, 800, 1000][i % 4]
    };
  });
  const ref = (v: Dir, extra: object) => ({
    voteKey: v.voteAddress,
    identity: v.nodeAddress,
    name: v.name,
    ...extra
  });
  const history = Array.from({ length: HISTORY }, (_, k) => {
    const pv = dir.slice(spec.n + k * 3, spec.n + k * 3 + 8);
    return {
      epoch: EPOCH - HISTORY + 1 + k,
      stake: Math.round(spec.stake * (0.8 + k * 0.01 + (r() - 0.5) * 0.02)),
      validators: Math.max(1, spec.n - 10 + Math.round(k / 2)),
      compared: k > 0,
      minimumOnly: spec.kind === 'sfdp' ? 0 : 300 + k,
      added: pv.slice(0, 2).map(v => ref(v, { stake: 5e14 })),
      moreAdded: k % 4,
      dropped: pv.slice(2, 3).map(v => ref(v, { stakePrev: 3e14 })),
      moreDropped: 0,
      moved: pv
        .slice(3, 7)
        .map(v => ref(v, { net: Math.round((r() - 0.5) * 4e14) })),
      moreMoved: 12
    };
  });
  return {
    name: spec.name,
    kind: spec.kind,
    fullName: spec.fullName,
    authorities: ['Mock1111111111111111111111111111111111111111'],
    epoch: EPOCH,
    stake: spec.stake,
    top10Share: validators.slice(0, 10).reduce((a, v) => a + v.shareOfPool, 0),
    minimumOnly: spec.kind === 'sfdp' ? 0 : 366,
    fees: feesOf(spec.name, spec.kind),
    validators,
    history
  };
};

// ---- the routes ---------------------------------------------------------

/** The real answer, with mocked fields merged in (for a field an
 *  existing endpoint is getting). */
const withFields =
  (path: string, add: (q: Query) => Record<string, unknown>): Route =>
  async q => {
    const res = await realFetch(`${API_ENDPOINT}${path}?${q}`);
    if (!res.ok) return null;
    return { ...(await res.json()), ...add(q) };
  };

// ---- vote-account changes (/cluster/vote-account-changes,
// /validators/vote-account-changes) ---------------------------------------

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const key = (r: () => number, n = 44) =>
  Array.from({ length: n }, () => B58[Math.floor(r() * B58.length)]).join('');
const CHANGE_KINDS = [
  'voter',
  'voter',
  'withdraw',
  'withdraw',
  'inflationCommission',
  'blockRevenueCollector',
  'identity',
  'withdrawer',
  'inflationCollector',
  'blockRevenueCommission',
  'create'
];
/** One vote account's change on a given epoch. */
const changeEvent = (r: () => number, d: Dir, epoch: number) => {
  const kind = CHANGE_KINDS[Math.floor(r() * CHANGE_KINDS.length)];
  const slot =
    462_000_000 + (epoch - 1069) * 432_000 + Math.floor(r() * 432_000);
  const bps = kind.endsWith('Commission');
  const newValue =
    kind === 'create'
      ? { inflationCommissionBps: 500, blockRevenueCommissionBps: 10000 }
      : bps
        ? Math.floor(r() * 10) * 100
        : key(r);
  return {
    voteKey: d.voteAddress,
    identity: d.nodeAddress,
    name: d.name,
    epoch,
    slot,
    blockTime:
      Math.floor(Date.now() / 1000) -
      (1070 - epoch) * 150_000 -
      Math.floor(r() * 100_000),
    signature: key(r, 88),
    instructionIndex: 0,
    innerInstructionIndex: null,
    instruction: kind === 'withdraw' ? 'withdraw' : 'authorizeChecked',
    kind,
    signers: [key(r), ...(r() < 0.3 ? [key(r)] : [])],
    feePayer: key(r),
    newValue,
    oldValue:
      kind === 'create' || kind === 'withdraw'
        ? null
        : r() < 0.7
          ? bps
            ? 800
            : key(r)
          : null,
    blsPubkey: kind === 'voter' && r() < 0.5 ? key(r, 66) : null,
    oldBlsPubkey: null,
    lamports: kind === 'withdraw' ? Math.floor(r() * 50e9) : null,
    effectiveEpoch:
      kind === 'voter' || kind === 'identity'
        ? epoch + 2
        : kind.endsWith('Commission')
          ? epoch + 1
          : epoch
  };
};

const ROUTES: Record<string, Route> = {
  '/cluster/vote-account-changes': async q => {
    const epochs = Math.min(10, Math.max(1, Number(q.get('epochs') ?? 3)));
    const dir = (await directory()).filter(d => d.voteAddress);
    const events = [];
    for (let e = 1070; e > 1070 - epochs; e--) {
      const r = rng(`changes-${e}`);
      for (let i = 0; i < 40; i++)
        events.push(changeEvent(r, dir[Math.floor(r() * dir.length)], e));
    }
    events.sort((a, b) => b.slot - a.slot);
    return { startEpoch: 1071 - epochs, endEpoch: 1070, events };
  },
  '/validators/vote-account-changes': async q => {
    const id = q.get('identity') ?? q.get('voteKey') ?? '';
    const d = (await directory()).find(
      x => x.nodeAddress === id || x.voteAddress === id
    ) ?? { nodeAddress: id, voteAddress: id, name: null };
    const r = rng(`vchanges-${id}`);
    const n = Math.floor(r() * 7);
    const events = Array.from({ length: n }, () =>
      changeEvent(r, d, 1064 + Math.floor(r() * 7))
    ).sort((a, b) => a.slot - b.slot);
    return { voteKey: d.voteAddress, identity: d.nodeAddress, events };
  },
  // A validator's age (firstEpoch / epochsActive), coming to
  // /validators/status.
  '/validators/status': withFields('/validators/status', q => {
    const r = rng(q.get('identity') ?? '');
    const first = 400 + Math.floor(r() * 600);
    return {
      firstEpoch: first,
      epochsActive: 1070 - first - Math.floor(r() * 20),
      firstEpochIsRecordStart: first < 450
    };
  }),
  '/pools': () => ({
    epoch: EPOCH,
    pools: POOLS.map(p => ({
      name: p.name,
      kind: p.kind,
      fullName: p.fullName,
      authorities: [],
      stake: p.stake,
      validators: p.n,
      stakePrev: Math.round(p.stake * 0.98),
      validatorsPrev: Math.max(1, p.n - 3),
      // A long tail: the median sits well under the mean.
      medianStake: Math.round((p.stake / p.n) * 0.45),
      maxStake: Math.round(p.stake * (p.n > 100 ? 0.12 : 0.4)),
      maxName: 'Mock Validator',
      minimumOnly: p.kind === 'sfdp' ? 0 : 366,
      fees: feesOf(p.name, p.kind)
    }))
  }),
  '/pool': async q => {
    const name = (q.get('name') ?? '').toLowerCase();
    const spec = POOLS.find(p => p.name.toLowerCase() === name);
    return spec ? poolOf(spec) : null;
  }
};

// ---- the interceptors ---------------------------------------------------

/** The route for a request URL (on the API) and its query, if mocked. */
const match = (url: string, params?: Record<string, unknown>) => {
  if (!url.startsWith(API_ENDPOINT)) return null;
  const u = new URL(url);
  const route = ROUTES[u.pathname];
  if (!route) return null;
  const q = new URLSearchParams(u.search);
  for (const [k, v] of Object.entries(params ?? {}))
    if (v != null) q.set(k, String(v));
  return () => route(q);
};

export const install = () => {
  // The data provider (axios).
  axios.interceptors.request.use(config => {
    const m = match(config.url ?? '', config.params);
    if (m) {
      const adapter: AxiosAdapter = async cfg => {
        const data = await m();
        if (data == null)
          throw Object.assign(new Error('mock 404'), {
            isAxiosError: true,
            config: cfg,
            response: { status: 404, data: null, headers: {}, config: cfg }
          });
        return {
          data,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: cfg
        };
      };
      config.adapter = adapter;
    }
    return config;
  });
  // The fetch-based helpers (slots, blocks, the health probe).
  window.fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const m = match(url);
    if (!m) return realFetch(input, init);
    const data = await m();
    return new Response(JSON.stringify(data), {
      status: data == null ? 404 : 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  console.info(
    `[vx] mock API: ${Object.keys(ROUTES).join(', ')} answered locally; the rest from ${API_ENDPOINT}`
  );
};
