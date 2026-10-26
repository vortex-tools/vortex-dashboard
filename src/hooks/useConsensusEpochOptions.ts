import useConsensus from 'hooks/useConsensus';
import { useEpochLive } from 'hooks/useIngestion';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useMemo } from 'react';

/**
 * The consensus leaderboard's epoch picker: newest first - optionally the
 * next epoch (admission only), the current one, then past epochs with
 * data: the API's list (ingestion.footerEpochs) when it reports one; else,
 * assuming ingestion is contiguous up to now, the epochs after the newest
 * past epoch seen with no data. An epoch without data shows only while
 * it's the one being viewed (its URL was opened directly).
 */
const useConsensusEpochOptions = (
  epoch: number | null,
  { includeNext = false }: { includeNext?: boolean } = {}
) => {
  const context = useContext(VortexDataContext);
  const { cutoverEpoch } = useConsensus();
  const currentEpoch = context?.currentEpochState.epoch ?? null;
  const footerEpochs = useEpochLive().ingestion?.footerEpochs ?? null;
  const boards = context?.participationLeaderboardState.data;

  const fallbackFloor = useMemo(() => {
    let floor = cutoverEpoch;
    if (floor == null || currentEpoch == null) return floor;
    for (const [e, b] of boards ?? [])
      if (e < currentEpoch && consensusNoData(b))
        floor = Math.max(floor, e + 1);
    return floor;
  }, [cutoverEpoch, currentEpoch, boards]);

  const options = useMemo(() => {
    if (currentEpoch == null) return [];
    const past = footerEpochs
      ? [...footerEpochs].filter(e => e < currentEpoch)
      : fallbackFloor != null
        ? Array.from(
            { length: Math.max(0, currentEpoch - fallbackFloor) },
            (_, i) => fallbackFloor + i
          )
        : [];
    const out: Array<{ value: number; label: string }> = [
      ...(includeNext
        ? [
            {
              value: currentEpoch + 1,
              label: `Epoch ${currentEpoch + 1} (next: admission only)`
            }
          ]
        : []),
      { value: currentEpoch, label: `Epoch ${currentEpoch} (current)` },
      ...past
        .sort((x, y) => y - x)
        .map(e => ({ value: e, label: `Epoch ${e}` }))
    ];
    if (epoch != null && !out.some(o => o.value === epoch))
      out.push({ value: epoch, label: `Epoch ${epoch} (no data)` });
    return out;
  }, [footerEpochs, fallbackFloor, currentEpoch, epoch, includeNext]);

  const firstOffered = footerEpochs?.length
    ? Math.min(...footerEpochs)
    : fallbackFloor;
  return { options, firstOffered };
};

/** A participation board for an epoch we have no consensus data for. */
export const consensusNoData = (
  b:
    | {
        complete: boolean;
        lastIngestedSlot?: number | null;
        eligibleSlots: number;
      }
    | undefined
) => !!b && !b.complete && b.lastIngestedSlot == null && b.eligibleSlots === 0;

export default useConsensusEpochOptions;
