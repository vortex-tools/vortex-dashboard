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

/** Divergent kinds that point at latency: its vote came too late for a
 *  block that made the chain (a skip, or no vote at all). */
export const LATENCY_KINDS = new Set<Divergence>(['late-skip', 'missed-block']);

export type LeaderDivergence = {
  /** Its slots this validator could vote on (ingested, offline runs out). */
  slots: number;
  divergent: number;
  /** Of those, the latency kinds. */
  late: number;
};

/**
 * Per leader: how many of its slots this validator voted on, and on how
 * many its vote diverged from the chain. Slots in a run of
 * OFFLINE_RUN_SLOTS+ consecutive misses are left out (it wasn't voting at
 * all: not about whose block it was).
 */
export const divergenceByLeader = (
  codes: Uint8Array,
  firstSlot: number,
  divergent: Array<{ slot: number; kind: Divergence }>,
  leaderOf: (slot: number) => string | null
): Map<string, LeaderDivergence> => {
  // Offline runs, as a per-slot mask.
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
  const out = new Map<string, LeaderDivergence>();
  const of = (leader: string) => {
    let d = out.get(leader);
    if (!d) out.set(leader, (d = { slots: 0, divergent: 0, late: 0 }));
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
    const leader = leaderOf(d.slot);
    if (!leader) continue;
    const s = of(leader);
    s.divergent++;
    if (LATENCY_KINDS.has(d.kind)) s.late++;
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
    const s = out.get(r) ?? { slots: 0, divergent: 0, late: 0, leaders: 0 };
    s.slots += d.slots;
    s.divergent += d.divergent;
    s.late += d.late;
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
