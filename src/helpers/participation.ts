/**
 * Decoding for /epochs/participation/history: 2 bits per reward slot,
 * little-endian within each byte (slot i = bits 2*(i mod 4)..+1 of byte
 * i/4). 0 ineligible / not ingested yet, 1 notarized, 2 skipped (a real
 * vote, paid like notarize), 3 missed (eligible, neither vote).
 */
export const OUTCOME = {
  ineligible: 0,
  notarized: 1,
  skipped: 2,
  missed: 3
} as const;

export const decodeOutcomes = (base64: string, slots: number): Uint8Array => {
  const bytes = atob(base64);
  const out = new Uint8Array(slots);
  for (let i = 0; i < slots; i++)
    out[i] = (bytes.charCodeAt(i >> 2) >> ((i & 3) * 2)) & 3;
  return out;
};

export interface BucketOutcomes {
  /** 0-based bucket index within the epoch (1,000 slots each). */
  bucket: number;
  firstSlot: number;
  notarized: number;
  /** Skip votes that agreed with the chain (or whose outcome isn't known). */
  skipped: number;
  /** Skip votes on slots that made the chain. */
  lateSkipped: number;
  missed: number;
  ineligible: number;
}

export const SLOTS_PER_BUCKET = 1000;

/** A run of this many consecutive missed slots (ineligible slots don't
 *  break it) is 'offline': it spans several producers' windows, so it's
 *  the voter not voting - vortex-data's cutoff (thresholds.offlineSlots). */
export const OFFLINE_RUN_SLOTS = 32;

/** Per-1,000-slot-bucket outcome counts; with the cluster timeline, skips
 *  split into agreeing and late. */
export const bucketOutcomes = (
  codes: Uint8Array,
  firstSlot: number,
  cluster: Uint8Array | null = null
): BucketOutcomes[] => {
  const buckets: BucketOutcomes[] = [];
  for (let start = 0; start < codes.length; start += SLOTS_PER_BUCKET) {
    const b: BucketOutcomes = {
      bucket: start / SLOTS_PER_BUCKET,
      firstSlot: firstSlot + start,
      notarized: 0,
      skipped: 0,
      lateSkipped: 0,
      missed: 0,
      ineligible: 0
    };
    const end = Math.min(start + SLOTS_PER_BUCKET, codes.length);
    for (let i = start; i < end; i++) {
      const c = codes[i];
      if (c === OUTCOME.notarized) b.notarized++;
      else if (c === OUTCOME.skipped) {
        if (cluster && i < cluster.length && cluster[i] === 1) b.lateSkipped++;
        else b.skipped++;
      } else if (c === OUTCOME.missed) b.missed++;
      else b.ineligible++;
    }
    buckets.push(b);
  }
  return buckets;
};

/** Absolute slot numbers with the given outcome. */
export const slotsWith = (
  codes: Uint8Array,
  firstSlot: number,
  outcome: number
): number[] => {
  const out: number[] = [];
  codes.forEach((c, i) => {
    if (c === outcome) out.push(firstSlot + i);
  });
  return out;
};

/** Human copy for /alpenglow/rank-map notAdmitted reasons. */
export const NOT_ADMITTED_REASONS: Record<string, string> = {
  no_bls_key: 'no BLS key registered on the vote account',
  zero_stake: 'no active stake',
  below_minimum_balance: 'vote account below rent plus the admission ticket',
  duplicate_node_identity: 'another vote account uses the same node identity',
  duplicate_bls_key: 'another vote account uses the same BLS key',
  beyond_cap: 'outside the top 2,000 validators by stake',
  not_in_stake_set: 'not in the epoch’s stake set'
};

/** Cluster timeline codes (/epochs/cluster/history). */
export const CLUSTER = { unknown: 0, block: 1, skipped: 2, noData: 3 } as const;

/** How a validator's vote on a slot diverged from what the chain did. */
export type Divergence =
  | 'missed-block' // no vote seen on a block that landed
  | 'missed-skip' // no vote seen on a slot the chain skipped
  | 'missed' // no vote; the chain's outcome isn't known
  | 'late-skip' // voted skip on a slot that made the chain
  | 'notarized-skipped'; // notarized a block that didn't make the chain

/**
 * Slots where the validator's vote disagreed with the chain's outcome.
 * Agreeing votes (notarize on a block, skip on a skipped slot) are
 * correct and left out. `cluster` may be shorter than `validator` (or
 * absent) while ingestion catches up: those slots fall back to the
 * validator's own outcome.
 */
export const divergentSlots = (
  validator: Uint8Array,
  cluster: Uint8Array | null,
  firstSlot: number
): Array<{ slot: number; kind: Divergence }> => {
  const out: Array<{ slot: number; kind: Divergence }> = [];
  for (let i = 0; i < validator.length; i++) {
    const v = validator[i];
    const c = cluster && i < cluster.length ? cluster[i] : CLUSTER.unknown;
    let kind: Divergence | null = null;
    if (v === OUTCOME.missed)
      kind =
        c === CLUSTER.block
          ? 'missed-block'
          : c === CLUSTER.skipped
            ? 'missed-skip'
            : 'missed';
    else if (v === OUTCOME.skipped && c === CLUSTER.block) kind = 'late-skip';
    else if (v === OUTCOME.notarized && c === CLUSTER.skipped)
      kind = 'notarized-skipped';
    if (kind) out.push({ slot: firstSlot + i, kind });
  }
  return out;
};

/** Per-slot leader (node identity) from /epochs/leader-schedule. */
export const leaderAt = (
  schedule: {
    firstSlot: number;
    slotsPerEntry: number;
    leaders: string[];
  },
  indexes: Uint16Array,
  slot: number
): string | null => {
  const e = Math.floor((slot - schedule.firstSlot) / schedule.slotsPerEntry);
  if (e < 0 || e >= indexes.length) return null;
  return schedule.leaders[indexes[e]] ?? null;
};

/** The schedule's little-endian u16 leader indexes. */
export const decodeLeaderIndexes = (base64: string): Uint16Array => {
  const bytes = atob(base64);
  const out = new Uint16Array(bytes.length >> 1);
  for (let e = 0; e < out.length; e++)
    out[e] = bytes.charCodeAt(2 * e) | (bytes.charCodeAt(2 * e + 1) << 8);
  return out;
};

/** Participation = (notarize + skip votes) / eligible slots; null when not
 *  admitted or nothing is eligible yet. */
export const epochParticipationRate = (r: {
  admitted: boolean;
  eligibleSlots: number;
  notarizedSlots: number;
  skippedSlots: number;
}) =>
  r.admitted && r.eligibleSlots > 0
    ? (r.notarizedSlots + r.skippedSlots) / r.eligibleSlots
    : null;

/**
 * Ingest progress, for either API shape: per-slot streaming
 * (lastIngestedSlot) or the older 1,000-slot buckets (lastBucket /
 * totalBuckets).
 */
interface IngestFields {
  lastIngestedSlot?: number | null;
  lastBucket?: number | null;
  totalBuckets?: number;
  complete: boolean;
}

/** Anything ingested for this row / epoch yet. */
export const isIngested = (r: IngestFields): boolean =>
  r.lastIngestedSlot != null || r.lastBucket != null;

/** Short progress text: 'complete', 'through slot N', 'N / M buckets'. */
export const ingestProgress = (r: IngestFields): string =>
  r.complete
    ? 'epoch complete'
    : r.lastIngestedSlot != null
      ? `through slot ${r.lastIngestedSlot.toLocaleString()}`
      : r.lastBucket != null
        ? `${(r.lastBucket + 1).toLocaleString()} / ${(r.totalBuckets ?? 432).toLocaleString()} buckets`
        : 'not ingested yet';

/** Slots of the epoch ingested so far (for refetching timelines). */
export const ingestedSlotCount = (
  r: IngestFields,
  firstSlot: number
): number =>
  r.lastIngestedSlot != null
    ? Math.max(0, r.lastIngestedSlot - firstSlot + 1)
    : r.lastBucket != null
      ? (r.lastBucket + 1) * 1000
      : 0;
