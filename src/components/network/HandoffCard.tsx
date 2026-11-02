import SectionCard from 'components/common/SectionCard';
import { ProducerRow, ms } from 'components/validator/SkipCausesCard';
import {
  REGIONS,
  REGION_NAME,
  clusterExtra,
  delayTone,
  extraDelay,
  signedMs
} from 'helpers/network';
import { ProducerLeaderboard } from 'providers/vortex-schemas';
import { Table } from 'react-bootstrap';

type Num = number | null | undefined;
type Side = {
  count: number;
  p50Ms: number | null;
  p90Ms: number | null;
  expectedP50Ms?: number | null;
} | null;

/** "1,367 handoffs · 90th percentile 323 ms · network floor 39 ms", for a
 *  cell's hover. */
const about = (s: Side) =>
  s
    ? [
        `${s.count.toLocaleString()} handoffs`,
        s.p90Ms != null && `90th percentile ${ms(s.p90Ms)}`,
        s.expectedP50Ms != null && `network floor ${ms(s.expectedP50Ms)}`
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

/** An extra delay against the cluster's: red when 40+ ms more. */
const slow = (mine: Num, theirs: Num) =>
  delayTone(mine, theirs) === 'danger' ? ' text-danger' : '';

/**
 * Its handoffs for an epoch in one phone-width table: all of them, then by
 * where the other leader was - the median from the previous leader, its
 * extra delay (the median less one slot and the network floor: ~0 is the
 * physical limit), the extra delay to the next leader where the API has
 * it, and the cluster's extra delay (from that region). Counts, 90th
 * percentiles and floors on hover.
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
  // A slot that epoch (the cluster's pace within windows), for APIs that
  // don't give the extra delay themselves.
  const slotMs = cluster?.inWindow?.p50Ms;
  const out = pace.handoffOut;
  const inBy = pace.handoffByRegion;
  const outBy = pace.handoffOutByRegion;
  const hasOut = !!out;
  type Row = {
    key: string;
    label: string;
    median: Num;
    inSide: Side;
    extraIn: Num;
    outSide: Side;
    extraOut: Num;
    clusterExtra: Num;
    /** The cluster's on its outgoing route, for the To next cell. */
    clusterOut?: Num;
  };
  const rows: Row[] = [
    {
      key: 'all',
      label: 'All',
      median: it.p50Ms,
      inSide: { ...it, expectedP50Ms: pace.handoffExpectedP50Ms },
      extraIn: extraDelay(
        pace.handoffExcessP50Ms,
        slotMs,
        pace.handoffExtraP50Ms
      ),
      outSide: out
        ? { ...out, expectedP50Ms: pace.handoffOutExpectedP50Ms }
        : null,
      extraOut: extraDelay(
        pace.handoffOutExcessP50Ms,
        slotMs,
        pace.handoffOutExtraP50Ms
      ),
      clusterExtra: extraDelay(
        cluster?.handoffExcessP50Ms,
        slotMs,
        cluster?.handoffExtraP50Ms
      )
    },
    ...REGIONS.filter(
      r =>
        r !== 'unknown' &&
        ((inBy?.[r]?.count ?? 0) > 0 || (outBy?.[r]?.count ?? 0) > 0)
    ).map(r => {
      const i = inBy?.[r];
      const o = outBy?.[r];
      // The cluster on the same route: from r to its region (in), from
      // its region to r (out).
      const mine = pace.region;
      return {
        key: r,
        label: REGION_NAME[r],
        median: i?.p50Ms,
        inSide: i ?? null,
        extraIn: extraDelay(i?.excessP50Ms, slotMs, i?.extraP50Ms),
        outSide: o ?? null,
        extraOut: extraDelay(o?.excessP50Ms, slotMs, o?.extraP50Ms),
        clusterExtra: clusterExtra(cluster, r, mine, slotMs),
        clusterOut: mine ? clusterExtra(cluster, mine, r, slotMs) : undefined
      };
    })
  ];
  return (
    <SectionCard
      title="Leader Handoffs"
      icon="shuffle"
      info="From the previous leader: its first block after the previous leader's last. To the next leader: the next leader's first block after its last. A handoff spans the receiving leader's whole slot (~200 ms, building its block) plus the trip between the two, so the extra delay is the median less one slot (the cluster's pace within leader windows) and the network floor (the fibre-speed distance, ~200 km/ms): about 0 is as fast as physics allows. By region: by where the other leader was; the cluster's from that region. Hover a figure for its count, 90th percentile and floor."
    >
      <Table size="sm" className="data-table compact-rows fs-9 mb-0">
        <thead>
          <tr>
            <th />
            <th
              className="text-end"
              title="Median handoff from the previous leader"
            >
              Median
            </th>
            <th
              className="text-end"
              title="Its extra delay from the previous leader: the median less one slot and the network floor"
            >
              Extra
            </th>
            {hasOut && (
              <th
                className="text-end"
                title="Its extra delay to the next leader"
              >
                To next
              </th>
            )}
            <th
              className="text-end text-body-tertiary"
              title="The cluster's extra delay on the same route: from that region to this validator's"
            >
              Cluster
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key} className={r.key === 'all' ? 'fw-semibold' : ''}>
              <td className="text-nowrap">{r.label}</td>
              <td className="text-end font-monospace" title={about(r.inSide)}>
                {ms(r.median)}
              </td>
              <td
                className={`text-end font-monospace${slow(r.extraIn, r.clusterExtra)}`}
                title={about(r.inSide)}
              >
                {signedMs(r.extraIn)}
              </td>
              {hasOut && (
                <td
                  className={`text-end font-monospace${slow(r.extraOut, r.clusterOut ?? r.clusterExtra)}`}
                  title={about(r.outSide)}
                >
                  {signedMs(r.extraOut)}
                </td>
              )}
              <td className="text-end font-monospace text-body-tertiary fw-normal">
                {signedMs(r.clusterExtra)}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {!inBy && (
        <p className="fs-10 text-body-tertiary mt-2 mb-0">
          By region: not recorded for this epoch yet.
        </p>
      )}
    </SectionCard>
  );
};

export default HandoffCard;
