import StatCard from 'components/common/StatCard';
import { missCausesLine } from 'components/validator/ProducerMissesTable';
import { consensusPath, formatShare } from 'helpers/consensusBoards';
import { ingestProgress } from 'helpers/participation';
import useConsensusRecord from 'hooks/useConsensusRecord';
import { ParticipationLeaderboard } from 'providers/vortex-schemas';
import { useMemo } from 'react';
import { Col, Row } from 'react-bootstrap';

type Record = NonNullable<ReturnType<typeof useConsensusRecord>['row']>;

const pct = (v: number | null) =>
  v == null ? '—' : `${(v * 100).toFixed(2)}%`;

/**
 * One validator's voting for an epoch, as four cards: rank, Votes Landed,
 * Fast Votes, Missed Votes (the notarize / skip split is the bar under
 * them).
 */
const VotingStatCards = ({
  row,
  board,
  voteAddress,
  epoch,
  currentEpoch
}: {
  row: Record;
  /** The epoch's participation leaderboard (rank, cluster medians). */
  board: ParticipationLeaderboard | undefined;
  voteAddress: string | null | undefined;
  epoch: number | null;
  currentEpoch: number | null;
}) => {
  const lbRecord = board?.records.find(r => r.voteAddress === voteAddress);
  // The admitted cluster's median share of finalization certificates, to
  // read this validator's against.
  const finalizedMedian = useMemo(() => {
    if (!board?.finalizedCerts) return null;
    const v = board.records
      .filter(r => r.admitted)
      .map(r => r.finalizedSlots / board.finalizedCerts)
      .sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
  }, [board]);
  const eligible = row.eligibleSlots ?? 0;
  const participation =
    row.admitted && eligible > 0
      ? (row.notarizedSlots + row.skippedSlots) / eligible
      : null;

  return (
    <Row className="g-3">
      <Col xs={6} xl={3}>
        <StatCard
          label="Voting Rank"
          value={
            lbRecord?.rank != null
              ? `#${(lbRecord.rank + 1).toLocaleString()}`
              : '—'
          }
          // The card links to the voting leaderboard; say so (its stake
          // rank on hover).
          sublabel={
            <span
              title={
                row.stakeRank != null
                  ? `Stake rank #${(row.stakeRank + 1).toLocaleString()}`
                  : undefined
              }
            >
              {board && `of ${board.admitted.toLocaleString()} · `}
              <span className="text-primary">Leaderboard →</span>
            </span>
          }
          linkTo={consensusPath('voting', epoch, currentEpoch)}
        />
      </Col>
      <Col xs={6} xl={3}>
        <StatCard
          label="Votes Landed"
          value={participation != null ? formatShare(participation) : '—'}
          sublabel={ingestProgress(row)}
        />
      </Col>
      <Col xs={6} xl={3}>
        <StatCard
          label="Fast Votes"
          value={pct(
            row.finalizedCerts > 0
              ? row.finalizedSlots / row.finalizedCerts
              : null
          )}
          sublabel={
            <span title="Share of the epoch's finalization certificates its vote is in. Nearly all are fast certificates: the first 80% of stake whose notarize votes reached the next leader before it built its block. So a low share means its votes often arrive late at the next leaders - partly a matter of where it sits relative to them. Not rewarded.">
              {finalizedMedian != null
                ? `cluster median ${pct(finalizedMedian)}`
                : 'of finalization certificates'}
            </span>
          }
        />
      </Col>
      <Col xs={6} xl={3}>
        <StatCard
          label="Missed Votes"
          value={row.missedSlots.toLocaleString()}
          tone={row.missedSlots > 0 ? 'danger' : undefined}
          sublabel={
            <span
              title={
                missCausesLine(row.missCauses) ??
                'Its vote is not in the certificates'
              }
            >
              {eligible > 0
                ? `${pct(row.missedSlots / eligible)} of eligible`
                : 'vote not in certificates'}
            </span>
          }
        />
      </Col>
    </Row>
  );
};

export default VotingStatCards;
