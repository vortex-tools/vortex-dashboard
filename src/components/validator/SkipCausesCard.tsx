import Badge from 'components/base/Badge';
import SectionCard from 'components/common/SectionCard';
import { ProducerLeaderboard } from 'providers/vortex-schemas';
import { Table } from 'react-bootstrap';

type Record = ProducerLeaderboard['records'][number];
type Causes = NonNullable<Record['skipCauses']>;

/** Each skip cause: its name and what it means, worst first. */
const CAUSES: Array<[keyof Causes, string, string]> = [
  [
    'lateBlock',
    'Late block',
    'Its block was produced and notarized by 1%+ of stake, but the skip won.'
  ],
  ['noBlock', 'No block', 'No block of it reached the cluster in time.'],
  [
    'staleParent',
    'Wrong parent',
    'Its block was built on a parent the cluster had moved past.'
  ],
  ['duplicate', 'Duplicate', 'It sent more than one version of the block.'],
  [
    'offline',
    'Offline',
    'It wasn’t voting itself (a run of 32+ missed slots).'
  ],
  ['unknown', 'Unknown', 'No record of the slot to tell from.']
];

const ms = (v: number | null | undefined) =>
  v == null ? '—' : `${Math.round(v).toLocaleString('en-US')} ms`;

/**
 * Why its skipped slots this epoch were skipped (the API's classifier: a
 * late block, no block, a wrong parent, a duplicate, offline), and its
 * slot pace - its own slots within a window, and its first block after
 * the previous leader's - against the cluster's; a lagging producer is
 * flagged. Nothing before the epoch is classified.
 */
const SkipCausesCard = ({
  record,
  board
}: {
  record: Record | null | undefined;
  board: ProducerLeaderboard | null | undefined;
}) => {
  const causes = record?.skipCauses;
  const pace = record?.slotDuration;
  if (!record || (!causes && !pace)) return null;
  const cluster = board?.cluster?.slotDuration;
  const total = causes ? CAUSES.reduce((a, [k]) => a + (causes[k] ?? 0), 0) : 0;
  const ratio = board?.skipClassification?.laggingRatio;
  return (
    <SectionCard
      title="Skipped Slots and Pace"
      icon="fast-forward"
      badge={
        record.lagging ? (
          <Badge bg="warning" className="ms-2">
            Lagging
          </Badge>
        ) : undefined
      }
      info="Why its skipped slots this epoch were skipped, as the API classifies them, and its slot pace: its own slots within a leader window, and its first block after the previous leader's, against the cluster's (median, 90th percentile). Lagging: its in-window pace is well behind the cluster's."
    >
      {causes && (
        <>
          <h6 className="fs-10 text-uppercase text-body-tertiary mb-2">
            {total
              ? `Why its ${total.toLocaleString()} skipped slots were skipped`
              : 'No skipped slots this epoch'}
          </h6>
          {total > 0 && (
            <Table size="sm" className="data-table compact-rows fs-9 mb-3">
              <tbody>
                {CAUSES.filter(([k]) => causes[k] > 0).map(
                  ([k, label, what]) => (
                    <tr key={k}>
                      <td className="text-nowrap fw-semibold">{label}</td>
                      <td className="text-end font-monospace">
                        {causes[k].toLocaleString()}
                      </td>
                      <td className="text-body-tertiary">{what}</td>
                    </tr>
                  )
                )}
              </tbody>
            </Table>
          )}
        </>
      )}
      {pace && (
        <>
          <h6 className="fs-10 text-uppercase text-body-tertiary mb-2">
            Slot pace
          </h6>
          <Table size="sm" className="data-table compact-rows fs-9 mb-0">
            <thead>
              <tr>
                <th />
                <th className="text-end">Median</th>
                <th className="text-end">90th pct</th>
                <th className="text-end">Cluster median</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Its own slots', pace.inWindow, cluster?.inWindow],
                  ['After the previous leader', pace.handoff, cluster?.handoff]
                ] as const
              ).map(([label, it, c]) => (
                <tr key={label}>
                  <td className="text-nowrap">{label}</td>
                  <td className="text-end font-monospace">{ms(it?.p50Ms)}</td>
                  <td className="text-end font-monospace text-body-tertiary">
                    {ms(it?.p90Ms)}
                  </td>
                  <td className="text-end font-monospace text-body-tertiary">
                    {ms(c?.p50Ms)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {record.lagging && (
            <p className="fs-10 text-warning-emphasis mt-2 mb-0">
              Its own slots run slow
              {ratio ? `: ${ratio}× the cluster's pace or more` : ''}.
            </p>
          )}
        </>
      )}
    </SectionCard>
  );
};

export default SkipCausesCard;
