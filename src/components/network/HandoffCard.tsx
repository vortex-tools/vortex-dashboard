import SectionCard from 'components/common/SectionCard';
import { ProducerRow, ms } from 'components/validator/SkipCausesCard';
import { REGIONS, REGION_NAME } from 'helpers/network';
import { ProducerLeaderboard } from 'providers/vortex-schemas';
import { Table } from 'react-bootstrap';

type Stat = { count: number; p50Ms: number; p90Ms: number } | null | undefined;
type Num = number | null | undefined;

/** "1,367 handoffs · 90th percentile 323 ms", for a cell's hover. */
const about = (s: Stat) =>
  s
    ? `${s.count.toLocaleString()} handoffs · 90th percentile ${ms(s.p90Ms)}`
    : undefined;

/** Over the floor against the cluster's: red when 25%+ slower. */
const slow = (mine: Num, theirs: Num) =>
  mine != null && theirs != null && theirs > 0 && mine / theirs > 1.25
    ? ' text-danger'
    : '';

/**
 * Its handoffs for an epoch, kept to a phone's width: in (the previous
 * leader's last block to its first) and out (its last to the next
 * leader's first, where the API has it) - the median, and over the
 * network floor (less the fibre-speed distance between the two) - against
 * the cluster's; then over the floor by region, in and out against the
 * cluster's handoffs from that region. Counts and 90th percentiles on
 * hover.
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
  const out = pace.handoffOut;
  const inBy = pace.handoffByRegion;
  const outBy = pace.handoffOutByRegion;
  const regions = REGIONS.filter(
    r =>
      r !== 'unknown' &&
      ((inBy?.[r]?.count ?? 0) > 0 || (outBy?.[r]?.count ?? 0) > 0)
  );
  const rows: Array<[string, Num, Num, string | undefined]> = [
    [
      'From previous leader, median',
      it.p50Ms,
      cluster?.handoff?.p50Ms,
      about(it)
    ],
    [
      'From previous leader, over the floor',
      pace.handoffExcessP50Ms,
      cluster?.handoffExcessP50Ms,
      undefined
    ],
    ...(out
      ? ([
          [
            'To next leader, median',
            out.p50Ms,
            cluster?.handoff?.p50Ms,
            about(out)
          ],
          [
            'To next leader, over the floor',
            pace.handoffOutExcessP50Ms,
            cluster?.handoffExcessP50Ms,
            undefined
          ]
        ] as Array<[string, Num, Num, string | undefined]>)
      : [])
  ];
  return (
    <SectionCard
      title="Handoffs"
      icon="shuffle"
      info="From previous leader: its first block after the previous leader's last. To next leader: the next leader's first block after its last. Each includes the network between the two; over the floor takes out the fibre-speed distance between them (~200 km/ms), so a validator far from the rest compares fairly. By region: over the floor, by where the other leader was, against the cluster's handoffs from that region. Hover a figure for its count and 90th percentile."
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
          {rows.map(([label, mine, theirs, title]) => (
            <tr key={label}>
              <td className="text-nowrap">{label}</td>
              <td
                className={`text-end font-monospace${slow(mine, theirs)}`}
                title={title}
              >
                {ms(mine)}
              </td>
              <td className="text-end font-monospace text-body-tertiary">
                {ms(theirs)}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {regions.length > 0 ? (
        <>
          <h6 className="fs-10 text-uppercase text-body-tertiary mt-3 mb-2">
            Over the floor, by region
          </h6>
          <Table size="sm" className="data-table compact-rows fs-9 mb-0">
            <thead>
              <tr>
                <th />
                <th
                  className="text-end"
                  title="Its handoffs from a previous leader in this region"
                >
                  From
                </th>
                {outBy && (
                  <th
                    className="text-end"
                    title="Its handoffs to a next leader in this region"
                  >
                    To
                  </th>
                )}
                <th
                  className="text-end text-body-tertiary"
                  title="The cluster's handoffs from this region"
                >
                  Cluster
                </th>
              </tr>
            </thead>
            <tbody>
              {regions.map(r => {
                const i = inBy?.[r];
                const o = outBy?.[r];
                const c = cluster?.handoffByRegion?.[r]?.excessP50Ms;
                return (
                  <tr key={r}>
                    <td className="text-nowrap">{REGION_NAME[r]}</td>
                    <td
                      className={`text-end font-monospace${slow(i?.excessP50Ms, c)}`}
                      title={
                        i
                          ? `${i.count.toLocaleString()} handoffs · median ${ms(i.p50Ms)} · network floor ${ms(i.expectedP50Ms)}`
                          : undefined
                      }
                    >
                      {ms(i?.excessP50Ms)}
                    </td>
                    {outBy && (
                      <td
                        className={`text-end font-monospace${slow(o?.excessP50Ms, c)}`}
                        title={
                          o
                            ? `${o.count.toLocaleString()} handoffs · median ${ms(o.p50Ms)} · network floor ${ms(o.expectedP50Ms)}`
                            : undefined
                        }
                      >
                        {ms(o?.excessP50Ms)}
                      </td>
                    )}
                    <td className="text-end font-monospace text-body-tertiary">
                      {ms(c)}
                    </td>
                  </tr>
                );
              })}
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
