import SectionCard from 'components/common/SectionCard';
import { ProducerRow, ms } from 'components/validator/SkipCausesCard';
import {
  REGIONS,
  REGION_NAME,
  delayTone,
  extraDelay,
  signedMs
} from 'helpers/network';
import { ProducerLeaderboard } from 'providers/vortex-schemas';
import { Table } from 'react-bootstrap';

type Stat = { count: number; p50Ms: number; p90Ms: number } | null | undefined;
type Num = number | null | undefined;

/** "1,367 handoffs · 90th percentile 323 ms", for a cell's hover. */
const about = (s: Stat) =>
  s
    ? `${s.count.toLocaleString()} handoffs · 90th percentile ${ms(s.p90Ms)}`
    : undefined;

/** An extra delay against the cluster's: red when 40+ ms more. */
const slow = (mine: Num, theirs: Num) =>
  delayTone(mine, theirs) === 'danger' ? ' text-danger' : '';

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
  board,
  note
}: {
  record: ProducerRow | null | undefined;
  board: ProducerLeaderboard | null | undefined;
  /** A caveat under the figures (a host change mid-epoch). */
  note?: string;
}) => {
  const pace = record?.slotDuration;
  const it = pace?.handoff;
  if (!record || !pace || !it) return null;
  const cluster = board?.cluster?.slotDuration;
  // A slot that epoch (the cluster's pace within windows): a handoff
  // spans one, so the extra delay is over the floor less it.
  const slotMs = cluster?.inWindow?.p50Ms;
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
      'From previous leader, extra delay',
      extraDelay(pace.handoffExcessP50Ms, slotMs, pace.handoffExtraP50Ms),
      extraDelay(
        cluster?.handoffExcessP50Ms,
        slotMs,
        cluster?.handoffExtraP50Ms
      ),
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
            'To next leader, extra delay',
            extraDelay(
              pace.handoffOutExcessP50Ms,
              slotMs,
              pace.handoffOutExtraP50Ms
            ),
            extraDelay(
              cluster?.handoffExcessP50Ms,
              slotMs,
              cluster?.handoffExtraP50Ms
            ),
            undefined
          ]
        ] as Array<[string, Num, Num, string | undefined]>)
      : [])
  ];
  return (
    <SectionCard
      title="Handoffs"
      icon="shuffle"
      info="From previous leader: its first block after the previous leader's last. To next leader: the next leader's first block after its last. A handoff spans the receiving leader's whole slot (~200 ms, building its block) plus the trip between the two, so the extra delay is the median less one slot (the cluster's pace within leader windows) and the network floor (the fibre-speed distance, ~200 km/ms): about 0 is as fast as physics allows. By region: by where the other leader was, against the cluster's handoffs from there. Hover a figure for its count, median and floor."
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
                {label.endsWith('extra delay') ? signedMs(mine) : ms(mine)}
              </td>
              <td className="text-end font-monospace text-body-tertiary">
                {label.endsWith('extra delay') ? signedMs(theirs) : ms(theirs)}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {regions.length > 0 ? (
        <>
          <h6 className="fs-10 text-uppercase text-body-tertiary mt-3 mb-2">
            Extra delay, by region
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
                const cr = cluster?.handoffByRegion?.[r];
                const c = extraDelay(cr?.excessP50Ms, slotMs, cr?.extraP50Ms);
                const ie = extraDelay(i?.excessP50Ms, slotMs, i?.extraP50Ms);
                const oe = extraDelay(o?.excessP50Ms, slotMs, o?.extraP50Ms);
                return (
                  <tr key={r}>
                    <td className="text-nowrap">{REGION_NAME[r]}</td>
                    <td
                      className={`text-end font-monospace${slow(ie, c)}`}
                      title={
                        i
                          ? `${i.count.toLocaleString()} handoffs · median ${ms(i.p50Ms)} · network floor ${ms(i.expectedP50Ms)}`
                          : undefined
                      }
                    >
                      {signedMs(ie)}
                    </td>
                    {outBy && (
                      <td
                        className={`text-end font-monospace${slow(oe, c)}`}
                        title={
                          o
                            ? `${o.count.toLocaleString()} handoffs · median ${ms(o.p50Ms)} · network floor ${ms(o.expectedP50Ms)}`
                            : undefined
                        }
                      >
                        {signedMs(oe)}
                      </td>
                    )}
                    <td className="text-end font-monospace text-body-tertiary">
                      {signedMs(c)}
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
      {note && <p className="fs-10 text-warning-emphasis mt-2 mb-0">{note}</p>}
    </SectionCard>
  );
};

export default HandoffCard;
