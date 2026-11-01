import Badge from 'components/base/Badge';
import SectionCard from 'components/common/SectionCard';
import { ProducerLeaderboard } from 'providers/vortex-schemas';
import { Table } from 'react-bootstrap';

type ProducerRow = ProducerLeaderboard['records'][number];
type Causes = NonNullable<ProducerRow['skipCauses']>;

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

/** The previous leader's region groups, in the order shown. */
const REGION: Record<string, string> = {
  northAmerica: 'North America',
  europe: 'Europe',
  asia: 'Asia',
  other: 'Elsewhere',
  unknown: 'Unknown'
};

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
  record: ProducerRow | null | undefined;
  board: ProducerLeaderboard | null | undefined;
}) => {
  const causes = record?.skipCauses;
  const pace = record?.slotDuration;
  if (!record || (!causes && !pace)) return null;
  const cluster = board?.cluster?.slotDuration;
  const total = causes ? CAUSES.reduce((a, [k]) => a + (causes[k] ?? 0), 0) : 0;
  const ratio = board?.skipClassification?.laggingRatio;
  // Handoffs by the previous leader's region, in REGION's order.
  const byRegion = pace?.handoffByRegion
    ? Object.keys(REGION)
        .filter(k => (pace.handoffByRegion![k]?.count ?? 0) > 0)
        .map(k => [k, pace.handoffByRegion![k]] as const)
    : null;
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
                <th className="text-end text-body-tertiary">Cluster</th>
                <th className="text-end">90th pct</th>
                <th className="text-end text-body-tertiary">Cluster</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Within its window', pace.inWindow, cluster?.inWindow],
                  [
                    'Handoff from the previous leader',
                    pace.handoff,
                    cluster?.handoff
                  ]
                ] as const
              ).map(([label, it, c]) => (
                <tr key={label}>
                  <td className="text-nowrap">{label}</td>
                  <td className="text-end font-monospace">{ms(it?.p50Ms)}</td>
                  <td className="text-end font-monospace text-body-tertiary">
                    {ms(c?.p50Ms)}
                  </td>
                  <td className="text-end font-monospace">{ms(it?.p90Ms)}</td>
                  <td className="text-end font-monospace text-body-tertiary">
                    {ms(c?.p90Ms)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {byRegion && (
            <>
              <h6 className="fs-10 text-uppercase text-body-tertiary mt-3 mb-2">
                Handoff by where the previous leader was
                {pace.region && REGION[pace.region]
                  ? ` (it's in ${REGION[pace.region]})`
                  : ''}
              </h6>
              <Table size="sm" className="data-table compact-rows fs-9 mb-0">
                <thead>
                  <tr>
                    <th>From</th>
                    <th className="text-end">Handoffs</th>
                    <th className="text-end">Median</th>
                    <th
                      className="text-end"
                      title="The physical minimum: the distance between the two hosts at fibre speed (~200 km/ms)"
                    >
                      Network floor
                    </th>
                    <th
                      className="text-end"
                      title="The median handoff's time above its floor: routing, queueing and the leader's own pace"
                    >
                      Over the floor
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {byRegion.map(([k, r]) => (
                    <tr key={k}>
                      <td className="text-nowrap">{REGION[k] ?? k}</td>
                      <td className="text-end font-monospace text-body-tertiary">
                        {r.count.toLocaleString()}
                      </td>
                      <td className="text-end font-monospace">{ms(r.p50Ms)}</td>
                      <td className="text-end font-monospace text-body-tertiary">
                        {ms(r.expectedP50Ms)}
                      </td>
                      <td className="text-end font-monospace">
                        {ms(r.excessP50Ms)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}
          <p className="fs-10 text-body-tertiary mt-2 mb-0">
            Time per slot; lower is better. Within its window: its own
            consecutive slots. Handoff: from the previous leader&apos;s last
            block to its first, which includes the network between them.
          </p>
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
