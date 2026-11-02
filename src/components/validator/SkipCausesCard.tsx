import Badge from 'components/base/Badge';
import SectionCard from 'components/common/SectionCard';
import { ProducerLeaderboard } from 'providers/vortex-schemas';
import { Table } from 'react-bootstrap';
import { Link } from 'react-router';

export type ProducerRow = ProducerLeaderboard['records'][number];
type Causes = NonNullable<ProducerRow['skipCauses']>;

/** Each skip cause: its name and what it means, worst first. */
const CAUSES: Array<[keyof Causes, string, string]> = [
  [
    'lateBlock',
    'Late block',
    'Its block arrived, but too late: some stake (1%+) notarized it, and the cluster skipped the slot anyway.'
  ],
  ['noBlock', 'No block', 'The cluster never received a block for the slot.'],
  [
    'staleParent',
    'Wrong parent',
    'Its block built on a block the cluster had already moved past.'
  ],
  ['duplicate', 'Duplicate', 'It produced two different blocks for the slot.'],
  [
    'offline',
    'Offline',
    "It wasn't voting at the time (part of a run of 32+ missed slots)."
  ],
  ['unknown', 'Unknown', 'No record of the slot to tell why.']
];

export const ms = (v: number | null | undefined) =>
  v == null ? '—' : `${Math.round(v).toLocaleString('en-US')} ms`;

type Props = {
  record: ProducerRow | null | undefined;
  board: ProducerLeaderboard | null | undefined;
};

/** Its classified skipped slots this epoch (0 or none: no card). */
export const skippedTotal = (record: ProducerRow | null | undefined) =>
  record?.skipCauses
    ? CAUSES.reduce((a, [k]) => a + (record.skipCauses![k] ?? 0), 0)
    : 0;

/**
 * Why its skipped slots this epoch were skipped (the API's classifier: a
 * late block, no block, a wrong parent, a duplicate, offline). Nothing
 * before the epoch is classified.
 */
export const SkippedSlotsCard = ({ record }: Props) => {
  const causes = record?.skipCauses;
  const total = skippedTotal(record);
  if (!record || !causes || !total) return null;
  return (
    <SectionCard
      title="Skipped Slots"
      icon="slash"
      info="Why its skipped slots this epoch were skipped, as the API classifies them."
    >
      <Table size="sm" className="data-table compact-rows fs-9 mb-0">
        <tbody>
          {CAUSES.filter(([k]) => causes[k] > 0).map(([k, label, what]) => (
            <tr key={k}>
              <td className="text-nowrap fw-semibold">{label}</td>
              <td className="text-end font-monospace">
                {causes[k].toLocaleString()}
              </td>
              <td className="text-body-tertiary">{what}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </SectionCard>
  );
};

/**
 * Its slot pace: its own consecutive slots within a leader window,
 * against the cluster's - how fast it builds blocks. A lagging producer
 * is flagged. Its handoffs (the network between leaders) are the Network
 * tab's.
 */
export const SlotPaceCard = ({
  record,
  board,
  networkLink
}: Props & {
  /** The Network tab at this epoch: its handoffs and latency. */
  networkLink?: string;
}) => {
  const it = record?.slotDuration?.inWindow;
  if (!record || !it) return null;
  const c = board?.cluster?.slotDuration?.inWindow;
  const ratio = board?.skipClassification?.laggingRatio;
  return (
    <SectionCard
      title="Slot Pace"
      icon="fast-forward"
      badge={
        record.lagging ? (
          <Badge bg="warning" className="ms-2">
            Lagging
          </Badge>
        ) : undefined
      }
      info="How fast it builds its own blocks: slots 2-4 of each leader window, each timed from its own previous block (one clock, no handoff), against the cluster's (median, 90th percentile). The window's first slot includes the handoff from the previous leader, so it is left out here and shown on the Network tab. Lagging: well behind the cluster's."
      aside={
        networkLink ? (
          <Link to={networkLink} className="fs-9">
            Handoffs and latency →
          </Link>
        ) : undefined
      }
    >
      <Table size="sm" className="data-table compact-rows fs-9 mb-0">
        <thead>
          <tr>
            <th />
            <th className="text-end">This validator</th>
            <th className="text-end text-body-tertiary">Cluster</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ['Median', it.p50Ms, c?.p50Ms],
              ['90th percentile', it.p90Ms, c?.p90Ms]
            ] as const
          ).map(([label, mine, theirs]) => (
            <tr key={label}>
              <td className="text-nowrap">{label}</td>
              <td className="text-end font-monospace">{ms(mine)}</td>
              <td className="text-end font-monospace text-body-tertiary">
                {ms(theirs)}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="fs-10 text-body-tertiary mt-2 mb-0">
        Its slots after the first of each leader window, each against its own
        previous block; lower is better. The first slot (the handoff from the
        previous leader) is on the Network tab.
      </p>
      {record.lagging && (
        <p className="fs-10 text-warning-emphasis mt-2 mb-0">
          Its own slots run slow
          {ratio ? `: ${ratio}× the cluster's pace or more` : ''}.
        </p>
      )}
    </SectionCard>
  );
};
