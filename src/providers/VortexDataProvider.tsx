import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { API_ENDPOINT } from 'helpers/apiEndpoint';
import { fetchEpochCurrent } from 'hooks/useIngestion';
import { MIN_LEADER_SLOTS, PRODUCER_SORT } from 'helpers/consensusBoards';
import axios from 'axios';
import {
  isTransient,
  retryOnRecovery,
  noteApiFailure,
  noteApiSuccess,
  onApiRecovered
} from 'helpers/apiHealth';
import { z } from 'zod';
import {
  BlockInsight,
  AlpenglowStatus,
  EpochProgress,
  EpochEarnings,
  EpochIncome,
  EpochParticipation,
  EpochVoteStatsItem,
  EpochVotingLeaderboard,
  EpochIncomeLeaderboard,
  Validator,
  ValidatorStatus,
  ValidatorStake,
  ValidatorStatusSummary,
  blocksInsightsResponseSchema,
  epochEarningsListSchema,
  epochParticipationListSchema,
  participationLeaderboardSchema,
  producerLeaderboardSchema,
  participationHistorySchema,
  rankMapSchema,
  clusterHistorySchema,
  slotPageSchema,
  SlotPage,
  leaderScheduleSchema,
  ClusterHistory,
  LeaderSchedule,
  ParticipationHistory,
  RankMap,
  ParticipationLeaderboard,
  ProducerLeaderboard,
  epochIncomeLeaderboardSchema,
  epochIncomeListSchema,
  epochVoteRecordResponseSchema,
  epochVoteStatsListSchema,
  epochVotingLeaderboardSchema,
  validatorStakeSchema,
  stakeChangesSchema,
  productionHistorySchema,
  participationMissesSchema,
  ParticipationMisses,
  productionWindowsSchema,
  ProductionEpoch,
  ProductionWindows,
  StakeChangeEpoch,
  validatorStatusSchema,
  validatorStatusSummarySchema,
  clusterDistributionSchema,
  ClusterDistribution,
  clusterGeoHistorySchema,
  blockIncomeRowsSchema,
  validatorDelegatorsSchema,
  validatorNamesSchema,
  hostChangesSchema,
  governanceProposalsSchema,
  GovernanceProposals,
  governanceProposalDetailSchema,
  GovernanceProposalDetail,
  validatorGovernanceSchema,
  ValidatorGovernance,
  clusterVersionsSchema,
  ClusterVersions,
  versionsTimelineSchema,
  VersionsTimeline,
  HostChanges,
  ValidatorNames,
  ValidatorDelegators,
  BlockIncomeRows,
  ClusterGeoHistory,
  validatorsResponseSchema
} from 'providers/vortex-schemas';

export type {
  SlotPage,
  SlotInfo,
  SlotFooter,
  ProducerRecord,
  ClusterHistory,
  FooterFacts,
  LeaderSchedule,
  ParticipationHistory,
  RankMap,
  AlpenglowStatus,
  EpochParticipation,
  ParticipationLeaderboard,
  ParticipationLeaderboardRecord,
  ProducerLeaderboard,
  ProducerLeaderboardRecord,
  VoteRewards,
  EpochEarnings,
  SfdpProgram,
  BlockInsight,
  BlockInsightLatencyEntry,
  BlockInsightStatus,
  EpochIncome,
  IncomeDetails,
  EpochVoteStatsItem,
  EpochVotingLeaderboard,
  EpochVotingLeaderboardRecord,
  EpochIncomeLeaderboard,
  EpochIncomeLeaderboardRecord,
  Validator,
  ValidatorStake,
  ValidatorStatus,
  ValidatorStatusCheck,
  ValidatorStatusSummary,
  ValidatorStatusSummaryRow
} from 'providers/vortex-schemas';
export { classifyBlockInsight } from 'providers/vortex-schemas';

// The cluster-baseline record that several endpoints return alongside
// per-validator data. Used everywhere — exported once to kill duplication.
export const IDEAL_RECORD_KEY = '11111111111111111111111111111111';

export type VoterRecord = number[];

// All endpoints accept GET + query string per /llms.txt. axios sends arrays
// as repeated keys by default (`?slots=1&slots=2`), which serde_urlencoded
// on the server does NOT decode — slices that take array params must
// pre-join them into a comma-separated string before handing them off.
/** Retries of a key's transient failure (2 s, 4 s, ... 32 s apart). */
const TRANSIENT_RETRIES = 6;

const getAndParse = async <T,>(
  path: string,
  params: Record<string, unknown>,
  schema: z.ZodType<T>,
  timeout = 15000
): Promise<T> => {
  let response;
  try {
    response = await axios.get(`${API_ENDPOINT}${path}`, { params, timeout });
  } catch (err) {
    noteApiFailure(err);
    throw err;
  }
  noteApiSuccess();
  return schema.parse(response.data);
};

const toErrorMessage = (err: unknown): string => {
  if (axios.isCancel(err)) return 'Request canceled';
  if (err instanceof z.ZodError) return `Invalid response: ${err.message}`;
  if (err instanceof Error) return err.message;
  return 'An unknown error occurred';
};

const base64ToBytes = (base64: string): number[] =>
  Array.from(atob(base64), c => c.charCodeAt(0));

// --------------------------------------------------------------------------
// Keyed slice factory
//
// Almost every slice here is "fetch resource by key, cache in Map, dedupe
// concurrent requests". This helper centralizes that pattern so individual
// slices can just declare: key type, response schema, and request builder.
// --------------------------------------------------------------------------

interface KeyedSlice<K, T> {
  data: Map<K, T>;
  isLoading: boolean;
  error: string | null;
  fetchData: (key: K, options?: { force?: boolean }) => Promise<void>;
  /**
   * Bulk variant: fetches many keys in a single roundtrip when the slice
   * config provides a `requestBatch` builder. Cached / in-flight / failed
   * keys are filtered out (use `{ force: true }` to retry). No-op when
   * `requestBatch` isn't configured.
   */
  fetchBatch: (keys: K[], options?: { force?: boolean }) => Promise<void>;
  clearError: () => void;
}

/** A forced fetch reuses a request for the same key started this
 *  recently (its answer is as fresh as a new one would be). */
const FRESH_INFLIGHT_MS = 2_000;

interface KeyedSliceConfig<K, TResponse, T> {
  /** Request builder: returns [endpoint path, query params, schema, timeoutMs]. */
  request: (key: K) => {
    path: string;
    params: Record<string, unknown>;
    schema: z.ZodType<TResponse>;
    timeout?: number;
  };
  /** Optional bulk request builder for slices backed by a batch endpoint. */
  requestBatch?: (keys: K[]) => {
    path: string;
    params: Record<string, unknown>;
    schema: z.ZodType<TResponse>;
    timeout?: number;
  };
  /** Maps the parsed response into cache entries. */
  toEntries: (key: K, response: TResponse) => Array<[K, T]>;
}

const useKeyedSlice = <K, TResponse, T>({
  request,
  requestBatch,
  toEntries
}: KeyedSliceConfig<K, TResponse, T>): KeyedSlice<K, T> => {
  const [data, setData] = useState<Map<K, T>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // In-flight requests, keyed by input key. Holds the promise (not just the
  // key) so a forced fetch can *wait out* a plain one already running for the
  // same key instead of being dropped — see fetchData.
  const inflightRef = useRef<Map<K, Promise<void>>>(new Map());
  const inflightStartRef = useRef<Map<K, number>>(new Map());
  // Keys we've successfully fetched, tracked by *input* key (not by cache
  // key). Required because `toEntries` can rewrite the key — e.g. a no-arg
  // leaderboard fetch is called with NaN but cached under the real epoch
  // number from the response. Without this tracker, `data.has(NaN)` would
  // stay false and the effect would refetch on every render.
  const completedRef = useRef<Set<K>>(new Set());
  // Keys that failed a fetch. We don't auto-retry these (which would loop
  // every re-render) — callers can pass `{ force: true }` or call clearError
  // to try again.
  const failedRef = useRef<Set<K>>(new Set());
  // Failed because the API couldn't be reached (restarting, down): these
  // re-run by themselves when it's back.
  const unreachableRef = useRef<Set<K>>(new Set());
  // Transient failures (5xx, unreachable) are retried with backoff:
  // attempts so far per key, and the latest fetchData for the timers.
  const retriesRef = useRef<Map<K, number>>(new Map());
  const fetchDataRef = useRef<
    ((key: K, options?: { force?: boolean }) => Promise<void>) | null
  >(null);

  const dataRef = useRef(data);
  dataRef.current = data;

  const clearError = useCallback(() => {
    setError(null);
    failedRef.current.clear();
  }, []);

  const fetchData = useCallback(
    async (key: K, options?: { force?: boolean }) => {
      const inflight = inflightRef.current.get(key);
      if (inflight) {
        // A plain fetch piggybacks on the request already running. A forced
        // one must NOT: the in-flight response was requested earlier and may
        // predate whatever the caller wants to see, so wait for it to settle
        // and then go again. Dropping it here used to make a page's
        // force-refresh a no-op whenever a plain kickoff for the same key
        // happened to fire in the same commit — the page then rendered
        // against the older snapshot for the rest of the session.
        if (!options?.force) return inflight;
        // ...unless it started a moment ago: that answer is fresh, and a
        // page's entry refresh right after its own kickoff would otherwise
        // fetch everything twice.
        const startedAt = inflightStartRef.current.get(key) ?? 0;
        if (Date.now() - startedAt < FRESH_INFLIGHT_MS) return inflight;
        await inflight.catch(() => {});
      }
      if (!options?.force) {
        if (dataRef.current.has(key)) return;
        if (completedRef.current.has(key)) return;
        if (failedRef.current.has(key)) return;
      }

      setIsLoading(true);

      const run = (async () => {
        try {
          const { path, params, schema, timeout } = request(key);
          const parsed = await getAndParse(path, params, schema, timeout);
          const entries = toEntries(key, parsed);
          setData(prev => {
            const next = new Map(prev);
            for (const [k, v] of entries) next.set(k, v);
            return next;
          });
          completedRef.current.add(key);
          failedRef.current.delete(key);
          retriesRef.current.delete(key);
          setError(null);
        } catch (err) {
          failedRef.current.add(key);
          if (retryOnRecovery(err)) unreachableRef.current.add(key);
          const n = retriesRef.current.get(key) ?? 0;
          if (isTransient(err) && n < TRANSIENT_RETRIES) {
            retriesRef.current.set(key, n + 1);
            setTimeout(
              () => {
                // Not if it has loaded meanwhile (the API came back).
                if (!completedRef.current.has(key))
                  void fetchDataRef.current?.(key, { force: true });
              },
              Math.min(2_000 * 2 ** n, 60_000)
            );
          }
          setError(toErrorMessage(err));
        } finally {
          setIsLoading(false);
        }
      })();
      inflightRef.current.set(key, run);
      inflightStartRef.current.set(key, Date.now());
      try {
        await run;
      } finally {
        if (inflightRef.current.get(key) === run) {
          inflightRef.current.delete(key);
        }
      }
    },
    [request, toEntries]
  );

  const fetchBatch = useCallback(
    async (keys: K[], options?: { force?: boolean }) => {
      if (!requestBatch) return;
      const todo: K[] = [];
      const seen = new Set<K>();
      for (const key of keys) {
        if (seen.has(key)) continue;
        seen.add(key);
        if (inflightRef.current.has(key)) continue;
        if (!options?.force) {
          if (dataRef.current.has(key)) continue;
          if (completedRef.current.has(key)) continue;
          if (failedRef.current.has(key)) continue;
        }
        todo.push(key);
      }
      if (todo.length === 0) return;

      setIsLoading(true);

      const run = (async () => {
        try {
          const { path, params, schema, timeout } = requestBatch(todo);
          const parsed = await getAndParse(path, params, schema, timeout);
          // toEntries' first arg is unused for bulk responses (those iterate
          // their own results array), but we pass a representative key for
          // the type signature.
          const entries = toEntries(todo[0], parsed);
          setData(prev => {
            const next = new Map(prev);
            for (const [k, v] of entries) next.set(k, v);
            return next;
          });
          todo.forEach(k => {
            completedRef.current.add(k);
            failedRef.current.delete(k);
          });
          setError(null);
        } catch (err) {
          todo.forEach(k => failedRef.current.add(k));
          if (retryOnRecovery(err))
            todo.forEach(k => unreachableRef.current.add(k));
          setError(toErrorMessage(err));
        } finally {
          setIsLoading(false);
        }
      })();
      todo.forEach(k => {
        inflightRef.current.set(k, run);
        inflightStartRef.current.set(k, Date.now());
      });
      try {
        await run;
      } finally {
        todo.forEach(k => {
          if (inflightRef.current.get(k) === run) {
            inflightRef.current.delete(k);
          }
        });
      }
    },
    [requestBatch, toEntries]
  );

  // The API is back: re-run what failed because it couldn't be reached.
  fetchDataRef.current = fetchData;
  useEffect(
    () =>
      onApiRecovered(() => {
        const keys = [...unreachableRef.current];
        unreachableRef.current.clear();
        if (!keys.length) return;
        keys.forEach(k => {
          failedRef.current.delete(k);
          retriesRef.current.delete(k);
        });
        setError(null);
        keys.forEach(k => void fetchData(k, { force: true }));
      }),
    [fetchData]
  );
  return useMemo(
    () => ({ data, isLoading, error, fetchData, fetchBatch, clearError }),
    [data, isLoading, error, fetchData, fetchBatch, clearError]
  );
};

// --------------------------------------------------------------------------
// Slice definitions
// --------------------------------------------------------------------------

const epochIncomeRequest = (identity: string) => ({
  path: '/epochs/income',
  params: { identity, limit: 100 },
  schema: epochIncomeListSchema,
  timeout: 10_000
});
const epochIncomeToEntries = (
  key: string,
  response: EpochIncome[]
): Array<[string, EpochIncome[]]> => [[key, response]];

// A validator's biggest blocks of an epoch, keyed `${identity}:${epoch}`.
export const TOP_BLOCKS = 5;
const topBlocksRequest = (key: string) => {
  const [identity, epoch] = key.split(':');
  return {
    path: '/blocks/income',
    params: { identity, epoch, sort: 'income', limit: TOP_BLOCKS },
    schema: blockIncomeRowsSchema,
    // ~6 s for the biggest validators (the API ranks every block).
    timeout: 45_000
  };
};
const topBlocksToEntries = (
  key: string,
  response: BlockIncomeRows
): Array<[string, BlockIncomeRows]> => [[key, response]];

// Alpenglow participation leaderboard, keyed by epoch.
const participationLeaderboardRequest = (epoch: number) => ({
  path: '/epochs/leaderboard/participation',
  params: { epoch },
  schema: participationLeaderboardSchema,
  timeout: 15_000
});
const participationLeaderboardToEntries = (
  key: number,
  response: ParticipationLeaderboard
): Array<[number, ParticipationLeaderboard]> => [[key, response]];

// Alpenglow block-producer leaderboard, keyed by epoch (default sort; the
// table re-sorts client-side).
const producerLeaderboardRequest = (epoch: number) => ({
  path: '/epochs/leaderboard/producers',
  // Rank only producers with 20+ leader slots (the dashboard's rule), by
  // available inclusion (offline voters left out).
  params: {
    epoch,
    minLeaderSlots: MIN_LEADER_SLOTS,
    sortBy: PRODUCER_SORT
  },
  schema: producerLeaderboardSchema,
  timeout: 15_000
});
const producerLeaderboardToEntries = (
  key: number,
  response: ProducerLeaderboard
): Array<[number, ProducerLeaderboard]> => [[key, response]];

// One vote account's slot timeline for one epoch, keyed `${voteKey}:${epoch}`.
export const participationHistoryKey = (voteKey: string, epoch: number) =>
  `${voteKey}:${epoch}`;
const participationHistoryRequest = (key: string) => {
  const i = key.lastIndexOf(':');
  return {
    path: '/epochs/participation/history',
    params: { voteKey: key.slice(0, i), epoch: Number(key.slice(i + 1)) },
    schema: participationHistorySchema,
    timeout: 15_000
  };
};
const participationHistoryToEntries = (
  key: string,
  response: ParticipationHistory
): Array<[string, ParticipationHistory]> => [[key, response]];

// What the chain did per slot (one per epoch), keyed by epoch. Grows with
// ingestion while the epoch is live.
const clusterHistoryRequest = (epoch: number) => ({
  path: '/epochs/cluster/history',
  params: { epoch },
  schema: clusterHistorySchema,
  timeout: 15_000
});
const clusterHistoryToEntries = (
  key: number,
  response: ClusterHistory
): Array<[number, ClusterHistory]> => [[key, response]];

// The epoch's leader schedule, keyed by epoch. Immutable once complete.
const leaderScheduleRequest = (epoch: number) => ({
  path: '/epochs/leader-schedule',
  params: { epoch },
  schema: leaderScheduleSchema,
  timeout: 15_000
});
const leaderScheduleToEntries = (
  key: number,
  response: LeaderSchedule
): Array<[number, LeaderSchedule]> => [[key, response]];

// One slot's page (/slot), keyed by slot. Settled after ~1 minute.
const slotPageRequest = (slot: number) => ({
  path: '/slot',
  params: { slot },
  schema: slotPageSchema,
  timeout: 15_000
});
const slotPageToEntries = (
  key: number,
  response: SlotPage
): Array<[number, SlotPage]> => [[key, response]];

// The epoch's rank map (admission + reasons), keyed by epoch. Immutable
// once verified.
const rankMapRequest = (epoch: number) => ({
  path: '/alpenglow/rank-map',
  params: { epoch },
  schema: rankMapSchema,
  timeout: 15_000
});
const rankMapToEntries = (
  key: number,
  response: RankMap
): Array<[number, RankMap]> => [[key, response]];

// Alpenglow participation per epoch for one VOTE account (oldest-first,
// from the cutover epoch on), keyed by vote key.
export const PARTICIPATION_EPOCHS = 30;
const epochParticipationRequest = (voteKey: string) => ({
  path: '/epochs/participation',
  params: { voteKey, limit: PARTICIPATION_EPOCHS },
  schema: epochParticipationListSchema,
  timeout: 10_000
});
const epochParticipationToEntries = (
  key: string,
  response: EpochParticipation[]
): Array<[string, EpochParticipation[]]> => [[key, response]];

// Keyed by node identity; the last EARNINGS_EPOCHS epochs + the current.
export const EARNINGS_EPOCHS = 30;
const epochEarningsRequest = (identity: string) => ({
  path: '/epochs/earnings',
  params: { identity, limit: EARNINGS_EPOCHS },
  schema: epochEarningsListSchema,
  timeout: 10_000
});
const epochEarningsToEntries = (
  key: string,
  response: EpochEarnings[]
): Array<[string, EpochEarnings[]]> => [[key, response]];

// Keyed by node identity. Callers refresh it every 30 s to match the
// endpoint's Cache-Control (max-age=30).
const validatorStatusRequest = (identity: string) => ({
  path: '/validators/status',
  params: { identity },
  schema: validatorStatusSchema,
  timeout: 15_000
});
const validatorStatusToEntries = (
  key: string,
  response: ValidatorStatus
): Array<[string, ValidatorStatus]> => [[key, response]];

// Keyed by node identity. A chain read per request (stake accounts), so
// callers refresh it sparingly.
const validatorStakeRequest = (identity: string) => ({
  path: '/validators/stake',
  params: { identity },
  schema: validatorStakeSchema,
  timeout: 15_000
});
const validatorStakeToEntries = (
  key: string,
  response: ValidatorStake
): Array<[string, ValidatorStake]> => [[key, response]];

// One voter's misses by producer for an epoch; key `${voteKey}:${epoch}`
// (participationHistoryKey).
const participationMissesRequest = (key: string) => {
  const [voteKey, epoch] = key.split(':');
  return {
    path: '/epochs/participation/misses',
    params: { voteKey, epoch: Number(epoch) },
    schema: participationMissesSchema,
    timeout: 20_000
  };
};
const participationMissesToEntries = (
  key: string,
  response: ParticipationMisses
): Array<[string, ParticipationMisses]> => [[key, response]];

// One validator's production per epoch (vote or node key), last 30.
const productionHistoryRequest = (voteKey: string) => ({
  path: '/epochs/production',
  params: {
    voteKey,
    limit: 30,
    minLeaderSlots: MIN_LEADER_SLOTS,
    sortBy: PRODUCER_SORT
  },
  schema: productionHistorySchema,
  timeout: 20_000
});
const productionHistoryToEntries = (
  key: string,
  response: ProductionEpoch[]
): Array<[string, ProductionEpoch[]]> => [[key, response]];

// One validator's leader windows in one epoch; key `${voteKey}:${epoch}`.
/** One page of a validator's played leader windows: limit 20, newest
 *  first, before `beforeSlot` (null = the newest), only windows with a
 *  skip or a Poor block when `issues`. APIs without paging ignore the
 *  page params and return every window (no `nextBeforeSlot`). */
export const PRODUCTION_WINDOWS_PAGE = 20;
/** Which windows a page holds: all, any issue (skip or Poor block), or
 *  only skips / only Poor blocks. */
export type WindowsFilter = 'all' | 'issues' | 'skipped' | 'poor';
export const productionWindowsKey = (
  voteKey: string,
  epoch: number,
  page: { beforeSlot?: number | null; filter?: WindowsFilter } = {}
) => `${voteKey}:${epoch}:${page.filter ?? 'all'}:${page.beforeSlot ?? ''}`;
const productionWindowsRequest = (key: string) => {
  const [voteKey, epoch, issues, before] = key.split(':');
  return {
    path: '/epochs/production/windows',
    params: {
      voteKey,
      epoch: Number(epoch),
      limit: PRODUCTION_WINDOWS_PAGE,
      // true: a skip or a Poor block; 'skipped' / 'poor': only that kind.
      ...(issues === 'issues'
        ? { issues: true }
        : issues === 'skipped' || issues === 'poor'
          ? { issues }
          : {}),
      ...(before ? { beforeSlot: Number(before) } : {})
    },
    schema: productionWindowsSchema,
    timeout: 20_000
  };
};
const productionWindowsToEntries = (
  key: string,
  response: ProductionWindows
): Array<[string, ProductionWindows]> => [[key, response]];

// Completed epochs' stake flows for one validator (identity), last 50.
// Client versions over the last N epochs (keyed by N), with who changed.
const clusterVersionsRequest = (epochs: number) => ({
  path: '/cluster/versions',
  params: { epochs, top: 50 },
  schema: clusterVersionsSchema,
  timeout: 30_000
});
const clusterVersionsToEntries = (
  key: number,
  response: ClusterVersions
): Array<[number, ClusterVersions]> => [[key, response]];

// Versions over the last `epochs` epochs, hourly.
const versionsTimelineRequest = (epochs: number) => ({
  path: '/cluster/versions/timeline',
  params: { epochs, bucketMins: 60 },
  schema: versionsTimelineSchema,
  timeout: 30_000
});
const versionsTimelineToEntries = (
  key: number,
  response: VersionsTimeline
): Array<[number, VersionsTimeline]> => [[key, response]];

// A validator's host changes: 100 epochs of moves, and events.
// Governance: every proposal (one key), one proposal by address, one
// validator's votes by identity.
export const GOVERNANCE_KEY = 'all';
const governanceProposalsRequest = () => ({
  path: '/governance/proposals',
  params: {},
  schema: governanceProposalsSchema,
  timeout: 20_000
});
const governanceProposalRequest = (address: string) => ({
  path: '/governance/proposal',
  params: { address },
  schema: governanceProposalDetailSchema,
  timeout: 30_000
});
const validatorGovernanceRequest = (identity: string) => ({
  path: '/validators/governance',
  params: { identity },
  schema: validatorGovernanceSchema,
  timeout: 20_000
});
const keyed =
  <K, T>() =>
  (key: K, response: T): Array<[K, T]> => [[key, response]];

const hostChangesRequest = (identity: string) => ({
  path: '/validators/host-changes',
  params: { identity, limit: 100 },
  schema: hostChangesSchema,
  timeout: 20_000
});
const hostChangesToEntries = (
  key: string,
  response: HostChanges
): Array<[string, HostChanges]> => [[key, response]];

// Every named identity, past validators included (CLUSTER_KEY).
const validatorNamesRequest = () => ({
  path: '/validators/names',
  params: {},
  schema: validatorNamesSchema,
  timeout: 20_000
});
const validatorNamesToEntries = (
  key: string,
  response: ValidatorNames
): Array<[string, ValidatorNames]> => [[key, response]];

// A validator's delegators at the last completed epoch (top + sizes).
const delegatorsRequest = (identity: string) => ({
  path: '/validators/delegators',
  params: { identity, limit: 25 },
  schema: validatorDelegatorsSchema,
  timeout: 20_000
});
const delegatorsToEntries = (
  key: string,
  response: ValidatorDelegators
): Array<[string, ValidatorDelegators]> => [[key, response]];

const stakeChangesRequest = (identity: string) => ({
  path: '/validators/stake-changes',
  params: { identity, limit: 50 },
  schema: stakeChangesSchema,
  timeout: 20_000
});
const stakeChangesToEntries = (
  key: string,
  response: StakeChangeEpoch[]
): Array<[string, StakeChangeEpoch[]]> => [[key, response]];

// The whole-cluster summary has no natural key; the slice is keyed by the
// constant VALIDATOR_STATUS_SUMMARY_KEY.
export const VALIDATOR_STATUS_SUMMARY_KEY = 'all';
const validatorStatusSummaryRequest = () => ({
  path: '/validators/status/summary',
  params: {},
  schema: validatorStatusSummarySchema,
  timeout: 20_000
});
const validatorStatusSummaryToEntries = (
  key: string,
  response: ValidatorStatusSummary
): Array<[string, ValidatorStatusSummary]> => [[key, response]];

// Cluster decentralization. distribution has no key (CLUSTER_KEY);
// geo-history is keyed by how many epochs back.
export const CLUSTER_KEY = 'cluster';
const clusterDistributionRequest = () => ({
  path: '/cluster/distribution',
  params: {},
  schema: clusterDistributionSchema,
  timeout: 20_000
});
const clusterDistributionToEntries = (
  key: string,
  response: ClusterDistribution
): Array<[string, ClusterDistribution]> => [[key, response]];
const clusterGeoHistoryRequest = (epochs: number) => ({
  path: '/cluster/geo-history',
  // 15: room to merge one company's ASNs and still show ten.
  params: { epochs, top: 15 },
  schema: clusterGeoHistorySchema,
  timeout: 30_000
});
const clusterGeoHistoryToEntries = (
  key: number,
  response: ClusterGeoHistory
): Array<[number, ClusterGeoHistory]> => [[key, response]];

const epochVoteStatsRequest = (voteKey: string) => ({
  path: '/epochs/vote-stats',
  params: { voteKey, limit: 100 },
  schema: epochVoteStatsListSchema,
  timeout: 10_000
});
const epochVoteStatsToEntries = (
  key: string,
  response: EpochVoteStatsItem[]
): Array<[string, EpochVoteStatsItem[]]> => [[key, response]];

// Vote records are keyed by the pair (voteKey, epoch). Represent that as a
// string key `${voteKey}:${epoch}` in the public Map so the slice contract
// stays consistent with the others, and expose a small helper for consumers.
export const voteRecordKey = (voteKey: string, epoch: number): string =>
  `${voteKey}:${epoch}`;

const epochVoteRecordRequest = (compoundKey: string) => {
  const [voteKey, epochStr] = compoundKey.split(':');
  const epoch = Number.parseInt(epochStr);
  return {
    path: '/epochs/votes',
    params: { voteKey, epoch: Number.isNaN(epoch) ? undefined : epoch },
    schema: epochVoteRecordResponseSchema,
    timeout: 15_000
  };
};
const epochVoteRecordToEntries = (
  _key: string,
  response: { epoch: number; votesBase64: string }
): Array<[string, VoterRecord]> => {
  // Use the server-reported epoch as the canonical cache key so "current epoch"
  // fetches (passed as NaN) resolve to a real slot when cached.
  const voteKey = _key.split(':')[0];
  return [
    [
      voteRecordKey(voteKey, response.epoch),
      base64ToBytes(response.votesBase64)
    ]
  ];
};

const epochVoteLeaderboardRequest = (epoch: number) => ({
  path: '/epochs/leaderboard/voting',
  params: { epoch: Number.isFinite(epoch) ? epoch : undefined },
  schema: epochVotingLeaderboardSchema,
  timeout: 15_000
});
const epochVoteLeaderboardToEntries = (
  _key: number,
  response: EpochVotingLeaderboard
): Array<[number, EpochVotingLeaderboard]> => [[response.epoch, response]];

// Block insights: keyed by slot. The /blocks/insights endpoint is bulk
// (up to 1000 slots per call), and the toEntries unpacks `results[]` so
// every returned slot lands in the cache regardless of which key
// triggered the request.
// GET form needs the array as a comma-separated string — `serde_urlencoded`
// on the server doesn't decode repeated keys. (POST took a JSON array.)
const blockInsightsRequest = (slot: number) => ({
  path: '/blocks/insights',
  params: { slots: String(slot) },
  schema: blocksInsightsResponseSchema,
  timeout: 15_000
});
const blockInsightsRequestBatch = (slots: number[]) => ({
  path: '/blocks/insights',
  params: { slots: slots.join(',') },
  schema: blocksInsightsResponseSchema,
  timeout: 15_000
});
const blockInsightsToEntries = (
  _key: number,
  response: { results: BlockInsight[] }
): Array<[number, BlockInsight]> =>
  response.results.map(insight => [insight.slot, insight]);

const epochIncomeLeaderboardRequest = (epoch: number) => ({
  path: '/epochs/leaderboard/income',
  params: { epoch: Number.isFinite(epoch) ? epoch : undefined },
  schema: epochIncomeLeaderboardSchema,
  timeout: 30_000
});
const epochIncomeLeaderboardToEntries = (
  _key: number,
  response: EpochIncomeLeaderboard
): Array<[number, EpochIncomeLeaderboard]> => [[response.epoch, response]];

// --------------------------------------------------------------------------
// Singleton slices (one-shot loads)
// --------------------------------------------------------------------------

interface CurrentEpochState {
  epoch: number | null;
  /** The cluster the API serves ('mainnet-beta' | 'testnet' | 'devnet');
   *  null until loaded or on APIs that predate the field (= mainnet). */
  cluster: string | null;
  /** Tower -> Alpenglow transition status; null = nothing scheduled. */
  alpenglow: AlpenglowStatus | null;
  /** Where the epoch was when fetched (slot, slot time, estimated end). */
  progress: EpochProgress | null;
  isLoading: boolean;
  error: string | null;
  /** Re-read /epochs/current (e.g. polled through the Alpenglow
   *  migration, whose phase changes under an open page). A failed refresh
   *  keeps the last good answer. */
  refresh: () => void;
}

/**
 * The last /epochs/current answer, saved per API so the next visit can
 * start epoch-keyed requests at once instead of waiting ~350 ms for it.
 * Epochs roll about daily, so the epoch is predicted from the saved
 * estimated end and slot time - and not at all near a boundary.
 */
const EPOCH_CACHE_KEY = `vx-epoch-current:${API_ENDPOINT}`;
const BOUNDARY_MARGIN_S = 120;
type SavedEpoch = {
  epoch: number;
  cluster: string | null;
  alpenglow: AlpenglowStatus | null;
  progress: EpochProgress | null;
};
export const predictEpoch = (
  saved: SavedEpoch,
  nowS: number
): number | null => {
  const p = saved.progress;
  if (!p?.estimatedEndTime || !p.slotSeconds) return null;
  const length = p.slotsInEpoch * p.slotSeconds;
  if (!(length > 0)) return null;
  // The estimate drifts with slot time: widen the margin with its age.
  const margin =
    BOUNDARY_MARGIN_S + 0.02 * Math.max(0, nowS - (p.readAt ?? nowS));
  const since = nowS - p.estimatedEndTime;
  const passed = since < 0 ? 0 : 1 + Math.floor(since / length);
  if (passed > 3) return null;
  // Distance to the nearest epoch boundary.
  const toEnd = p.estimatedEndTime + passed * length - nowS;
  const fromStart = length - toEnd;
  if (Math.min(toEnd, fromStart) < margin) return null;
  return saved.epoch + passed;
};
const readPredicted = (): SavedEpoch | null => {
  try {
    const raw = localStorage.getItem(EPOCH_CACHE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedEpoch;
    const epoch = predictEpoch(saved, Date.now() / 1000);
    if (epoch == null) return null;
    // A new epoch carries no progress yet; the status is the saved one.
    return {
      ...saved,
      epoch,
      progress: epoch === saved.epoch ? saved.progress : null
    };
  } catch {
    return null;
  }
};

const useCurrentEpochState = (): CurrentEpochState => {
  const [predicted] = useState(readPredicted);
  const [epoch, setEpoch] = useState<number | null>(predicted?.epoch ?? null);
  const [cluster, setCluster] = useState<string | null>(
    predicted?.cluster ?? null
  );
  const [alpenglow, setAlpenglow] = useState<AlpenglowStatus | null>(
    predicted?.alpenglow ?? null
  );
  const [progress, setProgress] = useState<EpochProgress | null>(
    predicted?.progress ?? null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Guard against StrictMode's double-invoke of mount effects firing two
  // requests. Refs survive the unmount/remount but aren't state.
  const startedRef = useRef(false);

  const inFlight = useRef(false);
  const load = useCallback(async (initial: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const parsed = await fetchEpochCurrent();
      setEpoch(parsed.epoch);
      setCluster(parsed.cluster ?? null);
      // Same status -> same object, so consumers keyed on it don't re-run.
      const ag = parsed.alpenglow ?? null;
      setAlpenglow(prev =>
        JSON.stringify(prev) === JSON.stringify(ag) ? prev : ag
      );
      setProgress(parsed.progress ?? null);
      setError(null);
      try {
        localStorage.setItem(
          EPOCH_CACHE_KEY,
          JSON.stringify({
            epoch: parsed.epoch,
            cluster: parsed.cluster ?? null,
            alpenglow: ag,
            progress: parsed.progress ?? null
          } satisfies SavedEpoch)
        );
      } catch {
        // storage blocked: the next visit just waits for the answer
      }
    } catch (err) {
      if (initial) {
        // Don't run on a predicted epoch the API can't confirm: pages
        // show "API unavailable" instead.
        setEpoch(null);
        setAlpenglow(null);
        setError(toErrorMessage(err));
      }
    } finally {
      inFlight.current = false;
      if (initial) setIsLoading(false);
    }
  }, []);
  const refresh = useCallback(() => void load(false), [load]);

  // Fetched once on mount (and refreshed only on request). A failure (API
  // down, e.g. mid-restart) leaves no epoch and sets `error`: callers show
  // "API unavailable", never read it as a Tower cluster.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void load(true);
  }, [load]);

  return useMemo(
    () => ({ epoch, cluster, alpenglow, progress, isLoading, error, refresh }),
    [epoch, cluster, alpenglow, progress, isLoading, error, refresh]
  );
};

export interface ValidatorDirectoryState {
  validators: Validator[] | null;
  byNodeAddress: Map<string, Validator>;
  byVoteAddress: Map<string, Validator>;
  /** Prefix-match on addresses, case-insensitive substring on names. */
  search: (query: string, limit?: number) => Validator[];
  isLoading: boolean;
  error: string | null;
}

/** The directory saved per API: names and address resolution at once on
 *  the next visit, while the fresh copy loads (isLoading stays true until
 *  it does, so an address the saved copy lacks still waits for it). */
const DIRECTORY_CACHE_KEY = `vx-validators:${API_ENDPOINT}`;
const readSavedDirectory = (): Validator[] | null => {
  try {
    const raw = localStorage.getItem(DIRECTORY_CACHE_KEY);
    return raw
      ? validatorsResponseSchema.parse({ validators: JSON.parse(raw) })
          .validators
      : null;
  } catch {
    return null;
  }
};

const useValidatorDirectoryState = (): ValidatorDirectoryState => {
  const [validators, setValidators] = useState<Validator[] | null>(
    readSavedDirectory
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const parsed = await getAndParse(
          '/validators',
          {},
          validatorsResponseSchema,
          15_000
        );
        setValidators(parsed.validators);
        try {
          localStorage.setItem(
            DIRECTORY_CACHE_KEY,
            JSON.stringify(parsed.validators)
          );
        } catch {
          // storage full or blocked: the next visit just waits for it
        }
      } catch (err) {
        setError(toErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const byNodeAddress = useMemo(() => {
    const map = new Map<string, Validator>();
    (validators ?? []).forEach(v => map.set(v.nodeAddress, v));
    return map;
  }, [validators]);

  const byVoteAddress = useMemo(() => {
    const map = new Map<string, Validator>();
    (validators ?? []).forEach(v => {
      if (v.voteAddress) map.set(v.voteAddress, v);
    });
    return map;
  }, [validators]);

  const search = useCallback(
    (query: string, limit = 20): Validator[] => {
      if (!validators) return [];
      const q = query.trim();
      if (!q) return [];
      const qLower = q.toLowerCase();
      const results: Validator[] = [];
      for (const v of validators) {
        const matchesAddress =
          v.nodeAddress.startsWith(q) ||
          (v.voteAddress !== null && v.voteAddress.startsWith(q));
        const matchesName =
          v.name !== null && v.name.toLowerCase().includes(qLower);
        if (matchesAddress || matchesName) {
          results.push(v);
          if (results.length >= limit) break;
        }
      }
      return results;
    },
    [validators]
  );

  return useMemo(
    () => ({
      validators,
      byNodeAddress,
      byVoteAddress,
      search,
      isLoading,
      error
    }),
    [validators, byNodeAddress, byVoteAddress, search, isLoading, error]
  );
};

// --------------------------------------------------------------------------
// Nested-Map wrapper for vote records
// --------------------------------------------------------------------------
//
// Pages historically read vote records as `data.get(voteKey)?.get(epoch)`.
// Keep that shape as a derived view over the flat-keyed storage inside
// useKeyedSlice, so existing consumers don't have to change.

interface EpochVoteRecordState {
  /** Nested `voteKey -> (epoch -> votes)` view, for backwards compatibility. */
  data: Map<string, Map<number, VoterRecord>>;
  isLoading: boolean;
  error: string | null;
  fetchData: (
    voteKey: string,
    epoch?: number,
    options?: { force?: boolean }
  ) => Promise<void>;
  clearError: () => void;
}

const useEpochVoteRecordState = (): EpochVoteRecordState => {
  const slice = useKeyedSlice<
    string,
    { epoch: number; votesBase64: string },
    VoterRecord
  >({
    request: epochVoteRecordRequest,
    toEntries: epochVoteRecordToEntries
  });

  const nested = useMemo(() => {
    const out = new Map<string, Map<number, VoterRecord>>();
    for (const [compoundKey, votes] of slice.data) {
      const [voteKey, epochStr] = compoundKey.split(':');
      const epoch = Number.parseInt(epochStr);
      if (Number.isNaN(epoch)) continue;
      let bucket = out.get(voteKey);
      if (!bucket) {
        bucket = new Map();
        out.set(voteKey, bucket);
      }
      bucket.set(epoch, votes);
    }
    return out;
  }, [slice.data]);

  const fetchData = useCallback(
    (voteKey: string, epoch?: number, options?: { force?: boolean }) => {
      // NaN signals "current epoch" to the request builder.
      return slice.fetchData(voteRecordKey(voteKey, epoch ?? NaN), options);
    },
    [slice]
  );

  return useMemo(
    () => ({
      data: nested,
      isLoading: slice.isLoading,
      error: slice.error,
      fetchData,
      clearError: slice.clearError
    }),
    [nested, slice.isLoading, slice.error, fetchData, slice.clearError]
  );
};

// --------------------------------------------------------------------------
// Epoch leaderboard wrappers (undefined epoch means "current")
// --------------------------------------------------------------------------

type OptionalEpochFetch = (
  epoch?: number,
  options?: { force?: boolean }
) => Promise<void>;

interface EpochLeaderboardSlice<T> {
  data: Map<number, T>;
  isLoading: boolean;
  error: string | null;
  fetchData: OptionalEpochFetch;
  clearError: () => void;
}

const useEpochLeaderboardSlice = <TResponse extends { epoch: number }>(
  config: KeyedSliceConfig<number, TResponse, TResponse>
): EpochLeaderboardSlice<TResponse> => {
  const slice = useKeyedSlice(config);

  const fetchData = useCallback<OptionalEpochFetch>(
    (epoch?: number, options?: { force?: boolean }) =>
      slice.fetchData(epoch ?? NaN, options),
    [slice]
  );

  return useMemo(
    () => ({
      data: slice.data,
      isLoading: slice.isLoading,
      error: slice.error,
      fetchData,
      clearError: slice.clearError
    }),
    [slice.data, slice.isLoading, slice.error, fetchData, slice.clearError]
  );
};

// --------------------------------------------------------------------------
// Context assembly
// --------------------------------------------------------------------------

interface VortexDataState {
  epochIncomeState: KeyedSlice<string, EpochIncome[]>;
  epochVoteStatsState: KeyedSlice<string, EpochVoteStatsItem[]>;
  epochVoteRecordState: EpochVoteRecordState;
  epochVoteLeaderboardState: EpochLeaderboardSlice<EpochVotingLeaderboard>;
  epochIncomeLeaderboardState: EpochLeaderboardSlice<EpochIncomeLeaderboard>;
  blockInsightsState: KeyedSlice<number, BlockInsight>;
  validatorStatusState: KeyedSlice<string, ValidatorStatus>;
  validatorStatusSummaryState: KeyedSlice<string, ValidatorStatusSummary>;
  clusterDistributionState: KeyedSlice<string, ClusterDistribution>;
  clusterGeoHistoryState: KeyedSlice<number, ClusterGeoHistory>;
  topBlocksState: KeyedSlice<string, BlockIncomeRows>;
  validatorStakeState: KeyedSlice<string, ValidatorStake>;
  stakeChangesState: KeyedSlice<string, StakeChangeEpoch[]>;
  delegatorsState: KeyedSlice<string, ValidatorDelegators>;
  validatorNamesState: KeyedSlice<string, ValidatorNames>;
  hostChangesState: KeyedSlice<string, HostChanges>;
  governanceProposalsState: KeyedSlice<string, GovernanceProposals>;
  governanceProposalState: KeyedSlice<string, GovernanceProposalDetail>;
  validatorGovernanceState: KeyedSlice<string, ValidatorGovernance>;
  clusterVersionsState: KeyedSlice<number, ClusterVersions>;
  versionsTimelineState: KeyedSlice<number, VersionsTimeline>;
  productionHistoryState: KeyedSlice<string, ProductionEpoch[]>;
  participationMissesState: KeyedSlice<string, ParticipationMisses>;
  productionWindowsState: KeyedSlice<string, ProductionWindows>;
  epochEarningsState: KeyedSlice<string, EpochEarnings[]>;
  participationLeaderboardState: KeyedSlice<number, ParticipationLeaderboard>;
  producerLeaderboardState: KeyedSlice<number, ProducerLeaderboard>;
  epochParticipationState: KeyedSlice<string, EpochParticipation[]>;
  participationHistoryState: KeyedSlice<string, ParticipationHistory>;
  rankMapState: KeyedSlice<number, RankMap>;
  clusterHistoryState: KeyedSlice<number, ClusterHistory>;
  leaderScheduleState: KeyedSlice<number, LeaderSchedule>;
  slotPageState: KeyedSlice<number, SlotPage>;
  currentEpochState: CurrentEpochState;
  validatorDirectoryState: ValidatorDirectoryState;
}

export const VortexDataContext = createContext<VortexDataState | undefined>(
  undefined
);

export const useVortexData = () => useContext(VortexDataContext);

interface VortexDataProviderProps {
  children: ReactNode;
}

export const VortexDataProvider: React.FC<VortexDataProviderProps> = ({
  children
}) => {
  const epochIncomeState = useKeyedSlice({
    request: epochIncomeRequest,
    toEntries: epochIncomeToEntries
  });
  const epochVoteStatsState = useKeyedSlice({
    request: epochVoteStatsRequest,
    toEntries: epochVoteStatsToEntries
  });
  const epochVoteRecordState = useEpochVoteRecordState();
  const epochVoteLeaderboardState = useEpochLeaderboardSlice({
    request: epochVoteLeaderboardRequest,
    toEntries: epochVoteLeaderboardToEntries
  });
  const epochIncomeLeaderboardState = useEpochLeaderboardSlice({
    request: epochIncomeLeaderboardRequest,
    toEntries: epochIncomeLeaderboardToEntries
  });
  const blockInsightsState = useKeyedSlice<
    number,
    { results: BlockInsight[] },
    BlockInsight
  >({
    request: blockInsightsRequest,
    requestBatch: blockInsightsRequestBatch,
    toEntries: blockInsightsToEntries
  });
  const validatorStatusState = useKeyedSlice({
    request: validatorStatusRequest,
    toEntries: validatorStatusToEntries
  });
  const validatorStatusSummaryState = useKeyedSlice({
    request: validatorStatusSummaryRequest,
    toEntries: validatorStatusSummaryToEntries
  });
  const clusterDistributionState = useKeyedSlice({
    request: clusterDistributionRequest,
    toEntries: clusterDistributionToEntries
  });
  const topBlocksState = useKeyedSlice({
    request: topBlocksRequest,
    toEntries: topBlocksToEntries
  });
  const clusterGeoHistoryState = useKeyedSlice({
    request: clusterGeoHistoryRequest,
    toEntries: clusterGeoHistoryToEntries
  });
  const validatorStakeState = useKeyedSlice({
    request: validatorStakeRequest,
    toEntries: validatorStakeToEntries
  });
  const clusterVersionsState = useKeyedSlice({
    request: clusterVersionsRequest,
    toEntries: clusterVersionsToEntries
  });
  const versionsTimelineState = useKeyedSlice({
    request: versionsTimelineRequest,
    toEntries: versionsTimelineToEntries
  });
  const governanceProposalsState = useKeyedSlice({
    request: governanceProposalsRequest,
    toEntries: keyed<string, GovernanceProposals>()
  });
  const governanceProposalState = useKeyedSlice({
    request: governanceProposalRequest,
    toEntries: keyed<string, GovernanceProposalDetail>()
  });
  const validatorGovernanceState = useKeyedSlice({
    request: validatorGovernanceRequest,
    toEntries: keyed<string, ValidatorGovernance>()
  });
  const hostChangesState = useKeyedSlice({
    request: hostChangesRequest,
    toEntries: hostChangesToEntries
  });
  const validatorNamesState = useKeyedSlice({
    request: validatorNamesRequest,
    toEntries: validatorNamesToEntries
  });
  const delegatorsState = useKeyedSlice({
    request: delegatorsRequest,
    toEntries: delegatorsToEntries
  });
  const stakeChangesState = useKeyedSlice({
    request: stakeChangesRequest,
    toEntries: stakeChangesToEntries
  });
  const participationMissesState = useKeyedSlice({
    request: participationMissesRequest,
    toEntries: participationMissesToEntries
  });
  const productionHistoryState = useKeyedSlice({
    request: productionHistoryRequest,
    toEntries: productionHistoryToEntries
  });
  const productionWindowsState = useKeyedSlice({
    request: productionWindowsRequest,
    toEntries: productionWindowsToEntries
  });
  const epochEarningsState = useKeyedSlice({
    request: epochEarningsRequest,
    toEntries: epochEarningsToEntries
  });
  const participationLeaderboardState = useKeyedSlice({
    request: participationLeaderboardRequest,
    toEntries: participationLeaderboardToEntries
  });
  const producerLeaderboardState = useKeyedSlice({
    request: producerLeaderboardRequest,
    toEntries: producerLeaderboardToEntries
  });
  const epochParticipationState = useKeyedSlice({
    request: epochParticipationRequest,
    toEntries: epochParticipationToEntries
  });
  const participationHistoryState = useKeyedSlice({
    request: participationHistoryRequest,
    toEntries: participationHistoryToEntries
  });
  const rankMapState = useKeyedSlice({
    request: rankMapRequest,
    toEntries: rankMapToEntries
  });
  const clusterHistoryState = useKeyedSlice({
    request: clusterHistoryRequest,
    toEntries: clusterHistoryToEntries
  });
  const leaderScheduleState = useKeyedSlice({
    request: leaderScheduleRequest,
    toEntries: leaderScheduleToEntries
  });
  const slotPageState = useKeyedSlice({
    request: slotPageRequest,
    toEntries: slotPageToEntries
  });
  const currentEpochState = useCurrentEpochState();
  const validatorDirectoryState = useValidatorDirectoryState();

  const value = useMemo<VortexDataState>(
    () => ({
      epochIncomeState,
      epochVoteStatsState,
      epochVoteRecordState,
      epochVoteLeaderboardState,
      epochIncomeLeaderboardState,
      blockInsightsState,
      validatorStatusState,
      validatorStatusSummaryState,
      clusterDistributionState,
      clusterGeoHistoryState,
      topBlocksState,
      validatorStakeState,
      stakeChangesState,
      delegatorsState,
      validatorNamesState,
      hostChangesState,
      governanceProposalsState,
      governanceProposalState,
      validatorGovernanceState,
      clusterVersionsState,
      versionsTimelineState,
      productionHistoryState,
      participationMissesState,
      productionWindowsState,
      epochEarningsState,
      participationLeaderboardState,
      producerLeaderboardState,
      epochParticipationState,
      participationHistoryState,
      rankMapState,
      clusterHistoryState,
      leaderScheduleState,
      slotPageState,
      currentEpochState,
      validatorDirectoryState
    }),
    [
      epochIncomeState,
      epochVoteStatsState,
      epochVoteRecordState,
      epochVoteLeaderboardState,
      epochIncomeLeaderboardState,
      blockInsightsState,
      validatorStatusState,
      validatorStatusSummaryState,
      clusterDistributionState,
      clusterGeoHistoryState,
      topBlocksState,
      validatorStakeState,
      stakeChangesState,
      delegatorsState,
      validatorNamesState,
      hostChangesState,
      governanceProposalsState,
      governanceProposalState,
      validatorGovernanceState,
      clusterVersionsState,
      versionsTimelineState,
      productionHistoryState,
      participationMissesState,
      productionWindowsState,
      epochEarningsState,
      participationLeaderboardState,
      producerLeaderboardState,
      epochParticipationState,
      participationHistoryState,
      rankMapState,
      clusterHistoryState,
      leaderScheduleState,
      slotPageState,
      currentEpochState,
      validatorDirectoryState
    ]
  );

  return (
    <VortexDataContext.Provider value={value}>
      {children}
    </VortexDataContext.Provider>
  );
};
