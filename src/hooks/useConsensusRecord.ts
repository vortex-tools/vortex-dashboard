import {
  bucketOutcomes,
  decodeLeaderIndexes,
  decodeOutcomes,
  divergentSlots,
  ingestedSlotCount,
  leaderAt
} from 'helpers/participation';
import useConsensus from 'hooks/useConsensus';
import useLiveRefresh from 'hooks/useLiveRefresh';
import useValidatorIdentity from 'hooks/useValidatorIdentity';
import {
  VortexDataContext,
  participationHistoryKey
} from 'providers/VortexDataProvider';
import { useContext, useEffect, useMemo } from 'react';
import { useParams } from 'react-router';

const REFRESH_MS = 60_000;
// Timelines (up to ~144 KB) are refetched once ingestion has moved this
// many slots past them - with per-slot streaming the summary moves every
// few seconds, and a 1,000-slot step keeps the old ~4-minute cadence.
const REFETCH_STEP = 1000;

/**
 * What every page of a validator's consensus record needs, from the route
 * (/validator/:address/consensus[/epoch/:epoch][/votes|/blocks]): the
 * identity, the epoch, its per-epoch summary (/epochs/participation), and
 * its slot timeline decoded against the chain's outcomes and the leader
 * schedule - kept fresh on the live epoch.
 */
const useConsensusRecord = ({ timeline: wantTimeline = true } = {}) => {
  const context = useContext(VortexDataContext);
  const { address, epoch: epochParam } = useParams();
  const identity = useValidatorIdentity(address);
  const consensus = useConsensus();
  const { alpenglowActive } = consensus;
  const currentEpoch = context?.currentEpochState.epoch ?? null;
  const parsed = epochParam ? Number.parseInt(epochParam) : NaN;
  const epoch = Number.isNaN(parsed) ? currentEpoch : parsed;
  // The record endpoints take the URL's address as their voteKey, node
  // or vote (the API resolves a node to its vote account), so requests
  // start at once and keep one cache key. voteAddress - the resolved vote
  // account - is for matching board records.
  const recordKey = address ?? '';
  const voteAddress = identity?.voteAddress ?? address ?? '';

  // Per-epoch summary (all epochs for this vote account).
  const summarySlice = context?.epochParticipationState;
  const fetchSummary = summarySlice?.fetchData;
  const rows = summarySlice?.data.get(recordKey);
  const row = rows?.find(r => r.epoch === epoch);
  useEffect(() => {
    if (alpenglowActive && recordKey) fetchSummary?.(recordKey);
  }, [alpenglowActive, recordKey, fetchSummary]);

  // Slot timeline.
  const historySlice = context?.participationHistoryState;
  const fetchHistory = historySlice?.fetchData;
  const hKey =
    wantTimeline && epoch != null && recordKey
      ? participationHistoryKey(recordKey, epoch)
      : null;
  const history = hKey ? historySlice?.data.get(hKey) : undefined;
  useEffect(() => {
    if (alpenglowActive && hKey) fetchHistory?.(hKey);
  }, [alpenglowActive, hKey, fetchHistory]);
  const historyUnavailable =
    !history && !historySlice?.isLoading && !!historySlice?.error;

  // What the chain did per slot, and who led each slot: one call per
  // epoch each, shared by every validator's page.
  const clusterSlice = context?.clusterHistoryState;
  const fetchCluster = clusterSlice?.fetchData;
  const clusterHistory =
    epoch != null ? clusterSlice?.data.get(epoch) : undefined;
  const fetchSchedule = context?.leaderScheduleState.fetchData;
  const schedule =
    epoch != null ? context?.leaderScheduleState.data.get(epoch) : undefined;
  useEffect(() => {
    if (!alpenglowActive || epoch == null || !wantTimeline) return;
    fetchCluster?.(epoch);
    fetchSchedule?.(epoch);
  }, [alpenglowActive, epoch, fetchCluster, fetchSchedule, wantTimeline]);

  // The summary refreshes every minute on the live epoch; the timeline
  // only once ingestion has moved REFETCH_STEP slots past it.
  const live = epoch != null && currentEpoch != null && epoch >= currentEpoch;
  useLiveRefresh(alpenglowActive && live, REFRESH_MS, () => {
    if (recordKey) fetchSummary?.(recordKey, { force: true });
  });
  const ingestedSlots =
    row && history ? ingestedSlotCount(row, history.firstSlot) : 0;
  useEffect(() => {
    if (
      hKey &&
      history &&
      live &&
      ingestedSlots >= history.slots + REFETCH_STEP
    )
      fetchHistory?.(hKey, { force: true });
  }, [hKey, history, live, ingestedSlots, fetchHistory]);
  useEffect(() => {
    if (
      epoch != null &&
      clusterHistory &&
      live &&
      ingestedSlots >= clusterHistory.slots + REFETCH_STEP
    )
      fetchCluster?.(epoch, { force: true });
  }, [epoch, clusterHistory, live, ingestedSlots, fetchCluster]);

  const timeline = useMemo(() => {
    if (!history?.outcomesBase64) return null;
    const codes = decodeOutcomes(history.outcomesBase64, history.slots);
    // The chain's per-slot outcome, aligned slot for slot (may lag the
    // validator timeline while ingestion catches up).
    const cluster =
      clusterHistory?.outcomesBase64 &&
      clusterHistory.firstSlot === history.firstSlot
        ? decodeOutcomes(clusterHistory.outcomesBase64, clusterHistory.slots)
        : null;
    return {
      codes,
      firstSlot: history.firstSlot,
      slots: history.slots,
      buckets: bucketOutcomes(codes, history.firstSlot, cluster),
      divergent: divergentSlots(codes, cluster, history.firstSlot),
      clusterKnown: !!cluster
    };
  }, [history, clusterHistory]);

  const leaderOf = useMemo(() => {
    if (!schedule) return null;
    const indexes = decodeLeaderIndexes(schedule.leaderIndexesBase64);
    return (slot: number) => leaderAt(schedule, indexes, slot);
  }, [schedule]);

  return {
    ...consensus,
    address: address ?? '',
    identity,
    recordKey,
    voteAddress,
    epoch,
    currentEpoch,
    rows,
    row,
    history,
    historyUnavailable,
    timeline,
    leaderOf
  };
};

export default useConsensusRecord;
