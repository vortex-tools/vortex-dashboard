import { NOT_ADMITTED_REASONS } from 'helpers/participation';
import useConsensusRecord from 'hooks/useConsensusRecord';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useEffect } from 'react';

type Record = NonNullable<ReturnType<typeof useConsensusRecord>['row']>;

/**
 * The top of the Voting and Production tabs when the validator wasn't
 * admitted that epoch: why (rank map). Rewards are the Income tab's.
 */
const RecordSummary = ({
  row,
  epoch,
  voteAddress
}: {
  row: Record;
  epoch: number;
  voteAddress: string | null | undefined;
}) => {
  const context = useContext(VortexDataContext);
  const notAdmitted = !row.admitted;
  const fetchRankMap = context?.rankMapState.fetchData;
  useEffect(() => {
    if (notAdmitted) fetchRankMap?.(epoch);
  }, [notAdmitted, epoch, fetchRankMap]);
  const reason = context?.rankMapState.data
    .get(epoch)
    ?.notAdmitted.find(n => n.voteAddress === voteAddress)?.reason;

  if (notAdmitted)
    return (
      <div className="bg-danger-subtle rounded px-3 py-2 mb-4 fs-9">
        <span className="fw-semibold text-danger">
          Not admitted in epoch {epoch}:
        </span>{' '}
        it couldn&apos;t vote at all
        {reason
          ? ` (${NOT_ADMITTED_REASONS[reason] ?? reason.replace(/_/g, ' ')}).`
          : '.'}
      </div>
    );
  return null;
};

export default RecordSummary;
