import { Divergence, OFFLINE_RUN_SLOTS, OUTCOME } from 'helpers/participation';
import { ValidatorGeo } from 'providers/vortex-schemas';

/** The API's region groups (slot pace's handoffByRegion), in the order
 *  shown, with their names. */
export const REGIONS = [
  'northAmerica',
  'europe',
  'asia',
  'other',
  'unknown'
] as const;
export type Region = (typeof REGIONS)[number];
export const REGION_NAME: Record<Region, string> = {
  northAmerica: 'North America',
  europe: 'Europe',
  asia: 'Asia',
  other: 'Elsewhere',
  unknown: 'Unknown'
};

/** A validator's region group, from its location's continent (as the API
 *  groups handoffs). */
export const regionOf = (g: ValidatorGeo | undefined): Region => {
  const c = g?.geo?.continent;
  if (!c) return 'unknown';
  return c === 'North America'
    ? 'northAmerica'
    : c === 'Europe'
      ? 'europe'
      : c === 'Asia'
        ? 'asia'
        : 'other';
};

/** Its divergent votes in two kinds: a skip on a notarized block, and no
 *  vote counted at all (a notarize on a skipped block did no harm, and
 *  isn't counted on the Network tab). */
export const SKIPPED_KINDS = new Set<Divergence>([
  'late-skip',
  'notarized-skipped'
]);
export const isSkipped = (k: Divergence) => SKIPPED_KINDS.has(k);

export type LeaderDivergence = {
  /** Its slots this validator could vote on (ingested, offline runs out). */
  slots: number;
  divergent: number;
  /** Of those: skip / notarize votes against the chain, and misses. */
  skipped: number;
  missed: number;
};

/**
 * Per leader: how many of its slots this validator voted on, and on how
 * many its vote diverged from the chain. Slots in a run of
 * OFFLINE_RUN_SLOTS+ consecutive misses are left out (it wasn't voting at
 * all: not about whose block it was).
 */
/** Slots in a run of OFFLINE_RUN_SLOTS+ consecutive misses, as a mask. */
const offlineMask = (codes: Uint8Array) => {
  const offline = new Uint8Array(codes.length);
  for (let i = 0; i < codes.length; ) {
    if (codes[i] !== OUTCOME.missed) {
      i++;
      continue;
    }
    let j = i;
    while (j < codes.length && codes[j] === OUTCOME.missed) j++;
    if (j - i >= OFFLINE_RUN_SLOTS) offline.fill(1, i, j);
    i = j;
  }
  return offline;
};

/** What a divergent vote was, in a few words, and its tone: the latency
 *  kinds red, other misses amber, a notarized skip blue. */
export const DIVERGENCE: Record<
  Divergence,
  { label: string; tone: 'danger' | 'warning' | 'info' }
> = {
  'late-skip': { label: 'Voted skip on a notarized block', tone: 'danger' },
  'missed-block': { label: 'Missed a block', tone: 'danger' },
  'missed-skip': { label: 'Missed a skip', tone: 'warning' },
  missed: { label: 'Missed', tone: 'warning' },
  'notarized-skipped': { label: 'Notarized a skipped block', tone: 'info' }
};

export type DivergentVote = {
  slot: number;
  kind: Divergence;
  /** The slot's leader: the block producer. */
  leader: string | null;
  /** The reward leader: slot + 8's, whose block carries the reward
   *  certificate its vote had to reach. */
  payer: string | null;
};

/** Its divergent votes, newest first, offline runs left out, with each
 *  slot's block producer and reward leader (slot + 8). */
export const divergentVotes = (
  codes: Uint8Array,
  firstSlot: number,
  divergent: Array<{ slot: number; kind: Divergence }>,
  leaderOf: (slot: number) => string | null
): DivergentVote[] => {
  const offline = offlineMask(codes);
  return divergent
    .filter(d => {
      const i = d.slot - firstSlot;
      return (
        i >= 0 &&
        i < codes.length &&
        !offline[i] &&
        // Notarizing a block the chain skipped did no harm: not shown.
        d.kind !== 'notarized-skipped'
      );
    })
    .map(d => ({
      ...d,
      leader: leaderOf(d.slot),
      payer: leaderOf(d.slot + 8)
    }))
    .sort((a, b) => b.slot - a.slot);
};

export const divergenceByLeader = (
  codes: Uint8Array,
  firstSlot: number,
  divergent: Array<{ slot: number; kind: Divergence }>,
  leaderOf: (slot: number) => string | null
): Map<string, LeaderDivergence> => {
  const offline = offlineMask(codes);
  const out = new Map<string, LeaderDivergence>();
  const of = (leader: string) => {
    let d = out.get(leader);
    if (!d)
      out.set(leader, (d = { slots: 0, divergent: 0, skipped: 0, missed: 0 }));
    return d;
  };
  for (let i = 0; i < codes.length; i++) {
    if (offline[i] || codes[i] === OUTCOME.ineligible) continue;
    const leader = leaderOf(firstSlot + i);
    if (leader) of(leader).slots++;
  }
  for (const d of divergent) {
    const i = d.slot - firstSlot;
    if (i < 0 || i >= codes.length || offline[i]) continue;
    // Notarizing a block the chain skipped did no harm: not counted.
    if (d.kind === 'notarized-skipped') continue;
    const leader = leaderOf(d.slot);
    if (!leader) continue;
    const s = of(leader);
    s.divergent++;
    if (isSkipped(d.kind)) s.skipped++;
    else s.missed++;
  }
  return out;
};

/** Leader divergence summed by the leaders' region. */
export const divergenceByRegion = (
  byLeader: Map<string, LeaderDivergence>,
  geo: Map<string, ValidatorGeo>
) => {
  const out = new Map<Region, LeaderDivergence & { leaders: number }>();
  for (const [leader, d] of byLeader) {
    const r = regionOf(geo.get(leader));
    const s = out.get(r) ?? {
      slots: 0,
      divergent: 0,
      skipped: 0,
      missed: 0,
      leaders: 0
    };
    s.slots += d.slots;
    s.divergent += d.divergent;
    s.skipped += d.skipped;
    s.missed += d.missed;
    s.leaders++;
    out.set(r, s);
  }
  return out;
};

/** Its network and data center (ASN, and ASN in its city) as shares of
 *  the stake with a known location, from the epoch's geography. */
export const networkShares = (node: string, geo: Map<string, ValidatorGeo>) => {
  const me = geo.get(node)?.geo;
  if (!me?.asn) return null;
  let total = 0;
  let asn = 0;
  let dc = 0;
  let asnCount = 0;
  let dcCount = 0;
  for (const v of geo.values()) {
    if (!v.geo?.asn) continue;
    total += v.activatedStake;
    if (v.geo.asn === me.asn) {
      asn += v.activatedStake;
      asnCount++;
      if (v.geo.city && v.geo.city === me.city) {
        dc += v.activatedStake;
        dcCount++;
      }
    }
  }
  return total
    ? {
        asnShare: asn / total,
        asnCount,
        dcShare: me.city ? dc / total : null,
        dcCount
      }
    : null;
};

/** The stake-weighted middle of a region's validators, for a line's end
 *  on the map. */
export const regionCenter = (
  region: Region,
  geo: Map<string, ValidatorGeo>
): [number, number] | null => {
  let w = 0;
  let lon = 0;
  let lat = 0;
  for (const v of geo.values()) {
    const g = v.geo;
    if (g?.longitude == null || g.latitude == null) continue;
    if (regionOf(v) !== region) continue;
    const s = Math.max(v.activatedStake, 1);
    w += s;
    lon += g.longitude * s;
    lat += g.latitude * s;
  }
  return w ? [lon / w, lat / w] : null;
};

/** Agave ends a window's first block this long before its slot is up
 *  (core/src/block_creation_loop.rs block_timeout: BLOCK_PRODUCTION_BUFFER
 *  50 + TIME_TO_COMPLETE_BLOCK_BROADCAST 6), so a handoff holds one slot
 *  less this of block building. */
export const FIRST_BLOCK_EARLY_MS = 56;

/**
 * A handoff's overhead: its time over the network floor less the next
 * leader's block building - one slot (`slotMs`, the cluster's pace within
 * leader windows that epoch) less FIRST_BLOCK_EARLY_MS, the API's
 * handoffBuildMs. The API's own figure wins when it has one.
 */
export const extraDelay = (
  overFloorMs: number | null | undefined,
  slotMs: number | null | undefined,
  /** The API's own figure (vortex-data 08d0c7e), used when it has one. */
  apiExtra?: number | null
) =>
  apiExtra != null
    ? apiExtra
    : overFloorMs == null || slotMs == null
      ? null
      : overFloorMs - (slotMs - FIRST_BLOCK_EARLY_MS);

type Num = number | null | undefined;

/** A slot-duration row's handoff floors (/epochs/leaderboard/producers,
 *  /validators/pace): direct and, where recorded, notarization. */
type HandoffFloors = {
  handoffExpectedP50Ms?: Num;
  handoffExcessP50Ms?: Num;
  handoffExtraP50Ms?: Num;
  handoffNotarizationExpectedP50Ms?: Num;
  handoffNotarizationExcessP50Ms?: Num;
  handoffNotarizationExtraP50Ms?: Num;
  handoffOutExpectedP50Ms?: Num;
  handoffOutExcessP50Ms?: Num;
  handoffOutExtraP50Ms?: Num;
  handoffOutNotarizationExpectedP50Ms?: Num;
  handoffOutNotarizationExcessP50Ms?: Num;
  handoffOutNotarizationExtraP50Ms?: Num;
};

/**
 * A row's handoff overhead, from the previous leader (`in`) or to the
 * next (`out`): against the notarization floor where the API has it - the
 * critical path while Fast Leader Handover is off: the previous block
 * reaching the voters, then 60% of stake's votes reaching the next leader
 * - else the direct floor (epochs classified before it). `notarized`
 * says which; `floorMs` is that floor.
 */
export const handoffExtra = (
  d: HandoffFloors | null | undefined,
  slotMs: Num,
  dir: 'in' | 'out' = 'in'
): { extra: number | null; floorMs: number | null; notarized: boolean } => {
  const n =
    dir === 'in'
      ? {
          floor: d?.handoffNotarizationExpectedP50Ms,
          excess: d?.handoffNotarizationExcessP50Ms,
          extra: d?.handoffNotarizationExtraP50Ms
        }
      : {
          floor: d?.handoffOutNotarizationExpectedP50Ms,
          excess: d?.handoffOutNotarizationExcessP50Ms,
          extra: d?.handoffOutNotarizationExtraP50Ms
        };
  if (n.extra != null || n.excess != null)
    return {
      extra: extraDelay(n.excess, slotMs, n.extra),
      floorMs: n.floor ?? null,
      notarized: true
    };
  return dir === 'in'
    ? {
        extra: extraDelay(d?.handoffExcessP50Ms, slotMs, d?.handoffExtraP50Ms),
        floorMs: d?.handoffExpectedP50Ms ?? null,
        notarized: false
      }
    : {
        extra: extraDelay(
          d?.handoffOutExcessP50Ms,
          slotMs,
          d?.handoffOutExtraP50Ms
        ),
        floorMs: d?.handoffOutExpectedP50Ms ?? null,
        notarized: false
      };
};

/** "+17 ms" / "−2 ms" / "—". */
export const signedMs = (v: number | null | undefined) => {
  if (v == null) return '—';
  const r = Math.round(v);
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toLocaleString('en-US')} ms`;
};

/** How an overhead compares with the cluster's: green within 10 ms,
 *  amber to 40 ms more, red beyond (differences: these sit near zero). */
export const delayTone = (
  mine: number | null | undefined,
  cluster: number | null | undefined
): 'success' | 'warning' | 'danger' | 'secondary' =>
  mine == null || cluster == null
    ? 'secondary'
    : mine - cluster <= 10
      ? 'success'
      : mine - cluster <= 40
        ? 'warning'
        : 'danger';

/** A move between hosts, for the map: a failover (to its spare and back)
 *  or a migration, with where it went from and to. */
export type HostMove = {
  epoch: number;
  /** The slot it was seen at (events of recent epochs); null for an
   *  epoch-level migration. */
  slot: number | null;
  kind: 'failover' | 'migration';
  from: [number, number] | null;
  to: [number, number] | null;
  fromLabel: string;
  toLabel: string;
};

type HostSide = {
  host: number | null;
  geo: {
    city: string | null;
    asnOrganization: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
};

const sideCoord = (h: HostSide): [number, number] | null =>
  h.geo?.longitude != null && h.geo.latitude != null
    ? [h.geo.longitude, h.geo.latitude]
    : null;
const sideLabel = (h: HostSide) =>
  [h.geo?.city, h.geo?.asnOrganization].filter(Boolean).join(' · ') ||
  'Unknown host';

/**
 * Its host moves, newest first: the minute-level events where the API has
 * them (failovers and moves; software changes left out), and the
 * epoch-level migrations of epochs before those.
 */
export const hostMoves = (data: {
  migrations: Array<{
    epoch: number;
    kind: string;
    before: HostSide;
    after: HostSide;
  }>;
  events: Array<{
    epoch: number;
    slot: number | null;
    kind: string;
    ipChanged: boolean | null;
    before: HostSide;
    after: HostSide;
  }>;
}): HostMove[] => {
  const move = (
    epoch: number,
    slot: number | null,
    kind: string,
    before: HostSide,
    after: HostSide
  ): HostMove => ({
    epoch,
    slot,
    kind: kind === 'failover' ? 'failover' : 'migration',
    from: sideCoord(before),
    to: sideCoord(after),
    fromLabel: sideLabel(before),
    toLabel: sideLabel(after)
  });
  const events = data.events.filter(
    e => e.kind !== 'software' && e.ipChanged !== false
  );
  const firstEventEpoch = events.length
    ? Math.min(...events.map(e => e.epoch))
    : Infinity;
  return [
    ...events.map(e => move(e.epoch, e.slot, e.kind, e.before, e.after)),
    ...data.migrations
      .filter(m => m.epoch < firstEventEpoch)
      .map(m => move(m.epoch, null, m.kind, m.before, m.after))
  ].sort((a, b) => b.epoch - a.epoch || (b.slot ?? 0) - (a.slot ?? 0));
};

/** A move's direction between two places (from > to): every repeat of a
 *  failover the same way shares it, the failback has its own. */
export const routeKey = (m: Pick<HostMove, 'from' | 'to'>) => {
  const k = (c: [number, number] | null) =>
    c ? `${c[0].toFixed(2)},${c[1].toFixed(2)}` : '?';
  return `${k(m.from)}>${k(m.to)}`;
};

/**
 * The cluster's overhead to compare a producer's handoffs with: on the
 * same route (from -> to) where the API has routes, else the cluster's
 * from that region (which mixes every destination: most handoffs from a
 * region go elsewhere, so its floor reads far longer than a same-region
 * route's).
 */
export const clusterExtra = (
  cluster:
    | {
        handoffByRoute?: Array<{
          from: string;
          to: string;
          excessP50Ms: number | null;
          extraP50Ms?: number | null;
        }> | null;
        handoffByRegion?: Record<
          string,
          { excessP50Ms: number | null; extraP50Ms?: number | null }
        > | null;
      }
    | null
    | undefined,
  from: string,
  to: string | null | undefined,
  slotMs: number | null | undefined
) => {
  const route =
    to != null
      ? cluster?.handoffByRoute?.find(x => x.from === from && x.to === to)
      : undefined;
  const r = route ?? cluster?.handoffByRegion?.[from];
  return extraDelay(r?.excessP50Ms, slotMs, r?.extraP50Ms);
};

/** Turbine's fanout (agave turbine/src/cluster_nodes.rs): positions
 *  1..FANOUT of the stake-weighted shuffle are layer 1. */
export const TURBINE_FANOUT = 200;

export type TurbineEstimate = {
  /** A shred's root, per continent group: its stake-heaviest data center
   *  and the group's share of stake (the chance a shred's root is there -
   *  it's drawn per shred, stake-weighted), most likely first. */
  paths: Array<{
    region: Region;
    root: [number, number];
    share: number;
    /** The root's city, for its label. */
    city: string | null;
  }>;
  /** The paths' roots, most likely first. */
  roots: Array<[number, number]>;
  /** 1: it's among the top TURBINE_FANOUT by stake - a shred reaches it
   *  from the root (2 hops); 2: through another node first (3 hops). */
  layer: 1 | 2;
  /** Layer 2: the stake-heavy data center nearest it, the likely relay. */
  via: [number, number] | null;
  /** Its rank by stake (1 = most), of the validators with a location. */
  rank: number;
};

/**
 * A rough Turbine path into a validator, not stake-adjusted (agave-master
 * from anza/master 9260869da1): the leader sends each shred to one root,
 * a stake-weighted draw that changes per shred; positions 1-200 of the
 * same stake-weighted shuffle (layer 1) get it from the root, everyone
 * else (layer 2, and every unstaked node) from a layer-1 node.
 */
export const turbineEstimate = (
  node: string,
  geo: Map<string, ValidatorGeo>
): TurbineEstimate | null => {
  const me = geo.get(node);
  const myC =
    me?.geo?.longitude != null && me.geo.latitude != null
      ? ([me.geo.longitude, me.geo.latitude] as [number, number])
      : null;
  if (!myC) return null;
  // Data centers (a provider in a city), by stake.
  const dcs = new Map<
    string,
    {
      stake: number;
      lon: number;
      lat: number;
      region: Region;
      city: string | null;
    }
  >();
  for (const v of geo.values()) {
    const g = v.geo;
    if (g?.longitude == null || g.latitude == null) continue;
    const k = `${g.asn ?? '?'}:${g.city ?? `${g.longitude},${g.latitude}`}`;
    const d = dcs.get(k) ?? {
      stake: 0,
      lon: 0,
      lat: 0,
      region: regionOf(v),
      city: g.city ?? null
    };
    const w = Math.max(v.activatedStake, 1);
    d.stake += w;
    d.lon += g.longitude * w;
    d.lat += g.latitude * w;
    dcs.set(k, d);
  }
  const sorted = [...dcs.values()].sort((a, b) => b.stake - a.stake);
  const ranked = sorted.map(
    d => [d.lon / d.stake, d.lat / d.stake] as [number, number]
  );
  // Each continent group's heaviest data center, with the group's share.
  const total = sorted.reduce((a, d) => a + d.stake, 0);
  const paths = REGIONS.filter(g => g !== 'unknown')
    .map(g => {
      const inG = sorted.filter(d => d.region === g);
      const top = inG[0];
      return top
        ? {
            region: g,
            root: [top.lon / top.stake, top.lat / top.stake] as [
              number,
              number
            ],
            share: total ? inG.reduce((a, d) => a + d.stake, 0) / total : 0,
            city: top.city
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.share >= 0.01)
    .sort((a, b) => b.share - a.share);
  const roots = paths.map(x => x.root);
  const byStake = [...geo.values()]
    .filter(v => v.geo?.longitude != null)
    .sort((a, b) => b.activatedStake - a.activatedStake);
  const rank = byStake.findIndex(v => v.nodeAddress === node) + 1;
  const layer: 1 | 2 =
    rank > 0 && rank <= TURBINE_FANOUT && (me?.activatedStake ?? 0) > 0 ? 1 : 2;
  // Layer 2's relay: the nearest of the next stake-heavy data centers.
  const dist = (a: [number, number], b: [number, number]) =>
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  const via =
    layer === 2
      ? (ranked.slice(1, 12).sort((a, b) => dist(a, myC) - dist(b, myC))[0] ??
        null)
      : null;
  return { paths, roots, layer, via, rank };
};
