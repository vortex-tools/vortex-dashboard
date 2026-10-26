import { productionRanks, rankOverall } from 'helpers/consensusBoards';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useEffect, useMemo } from 'react';

/**
 * The epoch's boards a consensus record page reads, fetched once per
 * epoch (slices dedupe): the participation board (voting rank, cluster
 * medians), the producer board (production), this validator's Overall
 * (voting + production) score and rank as on the leaderboard, and the
 * Production ranks as the Production view ranks them.
 */
const useRecordBoards = (
  alpenglowActive: boolean,
  epoch: number | null,
  voteAddress: string | null | undefined
) => {
  const context = useContext(VortexDataContext);
  const fetchBoard = context?.participationLeaderboardState.fetchData;
  const fetchProducers = context?.producerLeaderboardState.fetchData;
  useEffect(() => {
    if (!alpenglowActive || epoch == null) return;
    fetchBoard?.(epoch);
    fetchProducers?.(epoch);
  }, [alpenglowActive, epoch, fetchBoard, fetchProducers]);
  const board =
    epoch != null
      ? context?.participationLeaderboardState.data.get(epoch)
      : undefined;
  const producerBoard =
    epoch != null
      ? context?.producerLeaderboardState.data.get(epoch)
      : undefined;
  const slotsInEpoch =
    context?.currentEpochState.progress?.slotsInEpoch ?? undefined;
  const ranked = useMemo(
    () =>
      board && voteAddress
        ? rankOverall(
            board.records,
            producerBoard?.records ?? [],
            board.rewardTotals?.budgetLamports ?? null,
            slotsInEpoch
          ).get(voteAddress)
        : undefined,
    [board, producerBoard, voteAddress, slotsInEpoch]
  );
  const prodRanks = useMemo(
    () => (producerBoard ? productionRanks(producerBoard.records) : null),
    [producerBoard]
  );
  return { board, producerBoard, ranked, prodRanks };
};

export default useRecordBoards;
