import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import {
  formatShare,
  productionInclusion,
  productionLoss,
  productionLossLine,
  pts
} from 'helpers/consensusBoards';
import { formatLamports } from 'helpers/utils';
import { ProducerLeaderboardRecord } from 'providers/vortex-schemas';
import { Col, Row } from 'react-bootstrap';

const pct = (v: number | null | undefined) =>
  v == null ? '—' : `${(v * 100).toFixed(2)}%`;
const vs = (v: number | null | undefined) =>
  v == null ? undefined : `cluster ${pct(v)}`;

/**
 * A validator's block production for one epoch, from its producer
 * record: its Production rank and Inclusion (of online stake; the bonus
 * over what its leader slots could earn), Perfect and Poor blocks, leader
 * slots (skip rate on hover) and producer bonus - each against the
 * cluster's where it has one.
 */
const ProducingSection = ({
  record,
  cluster,
  producingShare,
  rank,
  rankedOf,
  rankLink
}: {
  record: ProducerLeaderboardRecord | undefined;
  cluster: ProducerLeaderboardRecord | null | undefined;
  /** Inclusion (the overall score's producing half). */
  producingShare: number | null | undefined;
  /** Its Production rank (0-based; productionRanks) and of how many. */
  rank: number | null | undefined;
  rankedOf: number | null | undefined;
  rankLink: string;
}) => {
  if (!record)
    return (
      <UntrackedState>
        No leader slots for this validator in this epoch (yet).
      </UntrackedState>
    );
  const loss = productionLoss(record);
  const perfect = (r: ProducerLeaderboardRecord | null | undefined) =>
    r?.perfectSlots != null && r.classifiedSlots
      ? r.perfectSlots / r.classifiedSlots
      : null;
  const inclusion = producingShare ?? productionInclusion(record);
  return (
    <Row className="g-3">
      <Col xs={6} md={4} xl={2}>
        <StatCard
          label="Production Rank"
          value={rank != null ? `#${(rank + 1).toLocaleString()}` : '—'}
          // The card links to the production leaderboard; say so.
          sublabel={
            <>
              {rankedOf != null && `of ${rankedOf.toLocaleString()} · `}
              <span className="text-primary">Leaderboard →</span>
            </>
          }
          linkTo={rankLink}
        />
      </Col>
      <Col xs={6} md={4} xl={2}>
        <StatCard
          label="Inclusion"
          value={inclusion != null ? formatShare(inclusion) : '—'}
          sublabel={
            <span title="Of the stake that was online (voters in a 32+ slot offline run left out), the share its leader slots carried; skipped slots carry 0, a block carrying 99.9%+ counts as full">
              {(() => {
                const c = productionInclusion(cluster);
                return c != null
                  ? `cluster ${formatShare(c)}`
                  : 'of online stake';
              })()}
            </span>
          }
        />
      </Col>
      <Col xs={6} md={4} xl={2}>
        {/* Its blocks that carried 99.9%+ of the online stake. */}
        <StatCard
          label="Perfect Blocks"
          value={pct(perfect(record))}
          sublabel={vs(perfect(cluster))}
        />
      </Col>
      <Col xs={6} md={4} xl={2}>
        {/* Where the inclusion went: Poor blocks (< 98% of online stake
            carried) and what they and the OK ones (98-99.9%) cost. */}
        <StatCard
          label="Poor Blocks"
          value={
            record.thinSlots != null ? record.thinSlots.toLocaleString() : '—'
          }
          sublabel={
            loss ? (
              <span
                title={`${productionLossLine(record) ?? ''} (OK blocks −${pts(loss.minor)})`}
              >
                −{pts(loss.thin)} inclusion
              </span>
            ) : (
              'not classified yet'
            )
          }
        />
      </Col>
      <Col xs={6} md={4} xl={2}>
        <StatCard
          label="Blocks Produced"
          value={record.blocks.toLocaleString()}
          tone={record.skippedSlots > 0 ? 'warning' : undefined}
          sublabel={
            <span
              title={`${record.blocks.toLocaleString()} of ${(record.blocks + record.skippedSlots).toLocaleString()} leader slots · skip rate ${pct(record.skipRate)}${cluster?.skipRate != null ? ` (cluster ${pct(cluster.skipRate)})` : ''}`}
            >
              {record.skippedSlots > 0
                ? `${record.skippedSlots.toLocaleString()} skipped`
                : `of ${(record.blocks + record.skippedSlots).toLocaleString()} slots`}
            </span>
          }
        />
      </Col>
      <Col xs={6} md={4} xl={2}>
        <StatCard
          label="Producer Bonus"
          value={
            record.producerBonusLamports != null
              ? formatLamports(record.producerBonusLamports, 2)
              : '—'
          }
          sublabel={
            <span title="Half of each vote its blocks carried">
              from carried votes
            </span>
          }
        />
      </Col>
    </Row>
  );
};

export default ProducingSection;
