import {
  ParticipationLeaderboardRecord,
  ProducerLeaderboardRecord
} from 'providers/vortex-schemas';

/**
 * The consensus leaderboard's three views of one epoch (one page,
 * /leaderboards/consensus?view=). Alpenglow pays one reward two ways: a
 * validator earns for its votes landing in other leaders' blocks (voting)
 * and for the votes its own blocks carry (the producer bonus, its half of
 * each), so 'overall' ranks the two together.
 */
export type ConsensusView = 'overall' | 'voting' | 'production';
export const CONSENSUS_VIEWS: ConsensusView[] = [
  'overall',
  'voting',
  'production'
];
export const CONSENSUS_VIEW_LABEL: Record<ConsensusView, string> = {
  overall: 'Overall',
  voting: 'Voting',
  production: 'Production'
};

export const parseConsensusView = (v: string | null): ConsensusView =>
  v === 'voting' || v === 'production'
    ? v
    : v === 'producing' // the old slug, in shared links
      ? 'production'
      : 'overall';

/** The leaderboard URL for a view and epoch (the current epoch has none). */
export const consensusPath = (
  view: ConsensusView,
  epoch: number | null,
  currentEpoch: number | null
) =>
  `/leaderboards/consensus${
    epoch != null && epoch !== currentEpoch ? `/epoch/${epoch}` : ''
  }${view === 'overall' ? '' : `?view=${view}`}`;

const SLOTS_PER_EPOCH = 432_000; // when the epoch's length isn't known

/** Leader slots it needs so far to be ranked on Overall and Production:
 *  any (no 20-slot floor since 2026-10-19 - small producers are hidden
 *  by the 'Hide low stake' switch instead). */
export const MIN_LEADER_SLOTS = 1;

/** "Low stake": stake that schedules fewer than this many leader slots an
 *  epoch (~0.023% of stake) - few enough that a perfect score is luck. */
export const LOW_STAKE_SLOTS = 100;
export const isLowStake = (
  stake: number,
  totalStake: number | null,
  slotsPerEpoch = SLOTS_PER_EPOCH
) => !!totalStake && (stake / totalStake) * slotsPerEpoch < LOW_STAKE_SLOTS;

/** Leader slots whose votes it could carry (the API's payableSlots, or
 *  finished slots plus certificates past its finished blocks). */
export const producerSlots = (p: ProducerLeaderboardRecord) =>
  p.payableSlots ??
  p.blocks + p.skippedSlots + Math.max(0, p.rewardCerts - p.blocks);

export interface OverallScore {
  /** Earned so far: vote rewards + producer bonus (lamports). */
  earned: number;
  voting: number;
  bonus: number;
  /** What its stake could have earned voting in the slots so far (slots
   *  with no reward certificate paid nobody: not counted). */
  votePossible: number;
  /** What its leader slots could have earned carrying every online
   *  voter's vote (offline voters aren't the producer's to carry). */
  producePossible: number;
  /** earned / (votePossible + producePossible). */
  share: number | null;
  /** voting / votePossible. */
  votingShare: number | null;
  /** bonus / producePossible (productionInclusion). null: no slots. */
  producingShare: number | null;
}

/**
 * One validator's overall reward share for the epoch so far. Vote side
 * from its participation record (earned + missed = what its stake could
 * earn - the Voting view's Rewards; unpayable slots paid nobody and
 * aren't its fault, so a perfect validator reaches 100%); production side from its
 * producer record: a leader slot carrying all stake earns budget / (2 x
 * slots per epoch) (the producer half), so what its slots could earn is
 * the online stake they could carry x that, and its share of it is the
 * available inclusion - offline voters are nobody's fault but their own,
 * like the vote side's unpayable slots. Lamport-weighted, so production
 * counts for the half of the reward it is.
 */
/**
 * A reward share as the leaderboard shows it: 3 decimals of a percent,
 * rounded DOWN so only a perfect record reads 100.000% (one missed vote in
 * 50,000 slots is 99.998%, not a rounded-up 100.00%). Ranks tie on exactly
 * this value, so equal-looking rows share a rank and nothing else does.
 */
export const shareKey = (v: number) => Math.floor(v * 1e5 + 1e-9);
export const formatShare = (v: number) => `${(shareKey(v) / 1e3).toFixed(3)}%`;

/**
 * Rows in rank order (unranked last, by stake), for a table's data: the
 * table breaks a sort's ties by row position, so any column's ties then
 * list in rank order, ascending or descending.
 */
export const byRank = <T>(
  rows: T[],
  rank: (row: T) => number | null | undefined,
  stake: (row: T) => number
): T[] =>
  [...rows].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra != null && rb != null) return ra - rb || stake(b) - stake(a);
    if (ra != null) return -1;
    if (rb != null) return 1;
    return stake(b) - stake(a);
  });

/** The producer metric the boards rank by (the API's sortBy): the
 *  Production score. */
export const PRODUCER_SORT = 'scoredInclusion';

/**
 * A producer's raw inclusion: the share of the stake that was online
 * (voters in a >= 32-slot offline run left out) its leader slots carried,
 * skipped slots carrying 0 - exactly what its bonus is the share of.
 * Falls back to effective inclusion (every admitted voter counted) on APIs
 * without it. null: no payable slots.
 */
export const rawInclusion = (
  p: ProducerLeaderboardRecord | null | undefined
): number | null =>
  p?.availableInclusion !== undefined
    ? p.availableInclusion
    : (p?.effectiveInclusion ?? null);

/**
 * A producer's Production score: its raw inclusion with every block that
 * carried >= 99.9% of the online stake counted as full (a late voter or
 * two is noise for ranking; vortex-data's scoredInclusion). Raw inclusion
 * on APIs without it.
 */
export const productionInclusion = (
  p: ProducerLeaderboardRecord | null | undefined
): number | null =>
  p?.scoredInclusion != null ? p.scoredInclusion : rawInclusion(p);

/**
 * Where a producer's inclusion went: the online stake its slots lost, by
 * cause, as fractions of the online stake they could carry (so they add
 * up to 1 - the score): skipped slots, thin blocks (< 98% carried) and
 * minor shortfalls (98-99.9%; blocks at 99.9%+ count as full and lose
 * nothing). null until classified.
 */
export const productionLoss = (
  p: ProducerLeaderboardRecord | null | undefined
) => {
  const avail = p?.availableStakePpbSum;
  if (
    !p ||
    !avail ||
    p.skippedLostPpbSum == null ||
    p.thinLostPpbSum == null ||
    p.minorLostPpbSum == null
  )
    return null;
  return {
    skipped: p.skippedLostPpbSum / avail,
    thin: p.thinLostPpbSum / avail,
    minor: p.minorLostPpbSum / avail
  };
};

/** A share of Production lost: 0.00349 -> "0.349%". */
export const pts = (v: number) => `${(v * 100).toFixed(3)}%`;

/** "lost 0.391%: skipped 0.000% · poor blocks 0.349% · OK blocks 0.042%" */
export const productionLossLine = (
  p: ProducerLeaderboardRecord | null | undefined
) => {
  const l = productionLoss(p);
  if (!l) return null;
  return `lost ${pts(l.skipped + l.thin + l.minor)}: skipped ${pts(l.skipped)} · poor blocks ${pts(l.thin)} · OK blocks ${pts(l.minor)}`;
};

/**
 * Producers' competition ranks by the Production score (productionInclusion,
 * MIN_LEADER_SLOTS or more leader slots), tying on the shown 3-decimal
 * value - the Production view's ranking. Keyed by node address; producers
 * not ranked are absent. Pass the producers shown (e.g. low stake hidden)
 * to rank among them.
 */
export const productionRanks = (
  records: ProducerLeaderboardRecord[],
  score: (p: ProducerLeaderboardRecord) => number | null = productionInclusion
) => {
  const ranked = records
    .map(r => ({ r, s: score(r) }))
    .filter(
      (x): x is { r: ProducerLeaderboardRecord; s: number } =>
        x.s != null && producerSlots(x.r) >= MIN_LEADER_SLOTS
    )
    .sort((a, b) => b.s - a.s);
  const out = new Map<string, number>();
  let rank = 0;
  ranked.forEach((x, i) => {
    if (i > 0 && shareKey(x.s) !== shareKey(ranked[i - 1].s)) rank = i;
    out.set(x.r.nodeAddress, rank);
  });
  return { ranks: out, rankedOf: ranked.length };
};

export const overallScore = (
  r: ParticipationLeaderboardRecord,
  p: ProducerLeaderboardRecord | undefined,
  budgetLamports: number | null,
  slotsPerEpoch = SLOTS_PER_EPOCH
): OverallScore | null => {
  const rw = r.rewards;
  if (!rw) return null;
  const voting = rw.votingLamports;
  const votePossible = rw.votingLamports + rw.missedLamports;
  const bonus = p?.producerBonusLamports ?? rw.producerBonusLamports ?? 0;
  const perSlot =
    budgetLamports != null ? budgetLamports / (2 * slotsPerEpoch) : null;
  const slots = p ? producerSlots(p) : 0;
  // What its slots could earn carrying every ONLINE voter: the bonus over
  // its inclusion of online stake. Not availableStakePpbSum x the per-slot
  // maximum: mid-epoch that sum stops at the last classified slot while
  // the bonus runs to the last ingested one (they agree once the epoch is
  // complete). With no inclusion to divide by (nothing carried yet, or
  // every slot skipped): every slot at full stake.
  const raw = rawInclusion(p);
  const producePossible =
    raw != null && raw > 0
      ? bonus / raw
      : perSlot != null
        ? slots * perSlot
        : 0;
  const possible = votePossible + producePossible;
  // The production half is scored, not raw: its share of what was
  // possible is the Production score (blocks carrying 99.9%+ count full),
  // so Overall ranks on the same footing. `earned` stays real lamports.
  const producingShare =
    productionInclusion(p) ??
    (producePossible > 0 ? bonus / producePossible : null);
  const scoredProduce =
    producingShare != null ? producingShare * producePossible : bonus;
  return {
    earned: voting + bonus,
    voting,
    bonus,
    votePossible,
    producePossible,
    share: possible > 0 ? (voting + scoredProduce) / possible : null,
    votingShare: votePossible > 0 ? voting / votePossible : null,
    producingShare
  };
};

export interface RankedOverall {
  score: OverallScore | null;
  /** Competition rank (0-based) by overall share; null: not ranked. */
  rank: number | null;
  /** Its producer record for the epoch, if it led any slots. */
  producer: ProducerLeaderboardRecord | undefined;
  /** Leader slots it could carry votes for, so far. */
  leaderSlots: number | null;
  /** All the leader slots the epoch's schedule gives it (windows x 4). */
  scheduledSlots: number | null;
}

/**
 * Every participation record's overall score and competition rank (equal
 * shown values - shareKey - share a rank; admitted validators with MIN_LEADER_SLOTS
 * or more leader slots so far only), joined to its
 * producer record by vote then node address. Keyed by vote address.
 */
export const rankOverall = (
  records: ParticipationLeaderboardRecord[],
  producers: ProducerLeaderboardRecord[],
  budgetLamports: number | null,
  slotsPerEpoch?: number
): Map<string, RankedOverall> => {
  const byVote = new Map<string, ProducerLeaderboardRecord>();
  const byNode = new Map<string, ProducerLeaderboardRecord>();
  for (const p of producers) {
    if (p.voteAddress) byVote.set(p.voteAddress, p);
    byNode.set(p.nodeAddress, p);
  }
  const out = new Map<string, RankedOverall>();
  for (const r of records) {
    const producer = byVote.get(r.voteAddress) ?? byNode.get(r.nodeAddress);
    out.set(r.voteAddress, {
      score: overallScore(r, producer, budgetLamports, slotsPerEpoch),
      rank: null,
      producer,
      leaderSlots: producer ? producerSlots(producer) : null,
      scheduledSlots:
        producer?.scheduledWindows != null
          ? producer.scheduledWindows * 4
          : null
    });
  }
  const ranked = records
    .filter(r => r.admitted)
    .map(r => out.get(r.voteAddress)!)
    .filter(
      x => x.score?.share != null && (x.leaderSlots ?? 0) >= MIN_LEADER_SLOTS
    )
    .sort((a, b) => b.score!.share! - a.score!.share!);
  let rank = 0;
  ranked.forEach((x, i) => {
    if (
      i > 0 &&
      shareKey(x.score!.share!) !== shareKey(ranked[i - 1].score!.share!)
    )
      rank = i;
    x.rank = rank;
  });
  return out;
};
