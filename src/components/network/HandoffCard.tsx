import SectionCard from 'components/common/SectionCard';
import { ProducerRow, ms } from 'components/validator/SkipCausesCard';
import { REGIONS, REGION_NAME } from 'helpers/network';
import { ProducerLeaderboard } from 'providers/vortex-schemas';
import { Table } from 'react-bootstrap';

/**
 * Its handoffs for an epoch: from the previous leader's last block to its
 * first, against the cluster's (median, 90th percentile), and the same
 * net of the network floor (the fibre-speed distance between the two) -
 * then by where the previous leader was, each against the cluster's
 * handoffs from the same region.
 */
const HandoffCard = ({
  record,
  board
}: {
  record: ProducerRow | null | undefined;
  board: ProducerLeaderboard | null | undefined;
}) => {
  const pace = record?.slotDuration;
  const it = pace?.handoff;
  if (!record || !pace || !it) return null;
  const cluster = board?.cluster?.slotDuration;
  const byRegion = pace.handoffByRegion
    ? REGIONS.filter(k => (pace.handoffByRegion![k]?.count ?? 0) > 0).map(
        k => [k, pace.handoffByRegion![k]] as const
      )
    : null;
  return (
    <SectionCard
      title="Handoffs"
      icon="shuffle"
      info="From the previous leader's last block to its first, which includes the network between them: its median and 90th percentile against the cluster's, and over the network floor - the handoff less the fibre-speed distance between the two hosts (~200 km/ms), so a validator far from the rest compares fairly. Then by where the previous leader was, against the cluster's handoffs from the same region."
    >
      <Table size="sm" className="data-table compact-rows fs-9 mb-0">
        <thead>
          <tr>
            <th />
            <th colSpan={2} className="text-center border-start">
              Median
            </th>
            <th colSpan={2} className="text-center border-start">
              90th percentile
            </th>
          </tr>
          <tr>
            <th />
            <th className="text-end border-start">This validator</th>
            <th className="text-end text-body-tertiary">Cluster</th>
            <th className="text-end border-start">This validator</th>
            <th className="text-end text-body-tertiary">Cluster</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="text-nowrap">
              Handoff ({it.count.toLocaleString()})
            </td>
            <td className="text-end font-monospace border-start">
              {ms(it.p50Ms)}
            </td>
            <td className="text-end font-monospace text-body-tertiary">
              {ms(cluster?.handoff?.p50Ms)}
            </td>
            <td className="text-end font-monospace border-start">
              {ms(it.p90Ms)}
            </td>
            <td className="text-end font-monospace text-body-tertiary">
              {ms(cluster?.handoff?.p90Ms)}
            </td>
          </tr>
          {pace.handoffExcessP50Ms != null && (
            <tr>
              <td
                className="text-nowrap"
                title="Its median handoff's time above the network floor between it and the previous leader"
              >
                Over the network floor
              </td>
              <td className="text-end font-monospace border-start">
                {ms(pace.handoffExcessP50Ms)}
              </td>
              <td className="text-end font-monospace text-body-tertiary">
                {ms(cluster?.handoffExcessP50Ms)}
              </td>
              <td className="border-start" />
              <td />
            </tr>
          )}
        </tbody>
      </Table>
      {byRegion ? (
        <>
          <h6 className="fs-10 text-uppercase text-body-tertiary mt-3 mb-2">
            By where the previous leader was
          </h6>
          <Table
            responsive
            size="sm"
            className="data-table compact-rows fs-9 mb-0"
          >
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
                <th
                  className="text-end text-body-tertiary"
                  title="The cluster's median over the floor, for handoffs from the same region"
                >
                  Cluster
                </th>
              </tr>
            </thead>
            <tbody>
              {byRegion.map(([k, r]) => (
                <tr key={k}>
                  <td className="text-nowrap">{REGION_NAME[k]}</td>
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
                  <td className="text-end font-monospace text-body-tertiary">
                    {ms(cluster?.handoffByRegion?.[k]?.excessP50Ms)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      ) : (
        <p className="fs-10 text-body-tertiary mt-2 mb-0">
          By region: not recorded for this epoch yet.
        </p>
      )}
    </SectionCard>
  );
};

export default HandoffCard;
