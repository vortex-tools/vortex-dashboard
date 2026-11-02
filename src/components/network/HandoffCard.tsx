import SectionCard from 'components/common/SectionCard';
import { ProducerRow, ms } from 'components/validator/SkipCausesCard';
import {
  REGIONS,
  REGION_NAME,
  clusterExtra,
  delayTone,
  extraDelay,
  handoffExtra,
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
  /** The floor's kind, for the hover. */
  floorLabel?: string;
} | null;

/** "1,367 handoffs · 90th percentile 323 ms · network floor 39 ms", for a
 *  cell's hover. */
const about = (s: Side) =>
  s
    ? [
        `${s.count.toLocaleString()} handoffs`,
        s.p90Ms != null && `90th percentile ${ms(s.p90Ms)}`,
        s.expectedP50Ms != null &&
          `${s.floorLabel ?? 'direct floor'} ${ms(s.expectedP50Ms)}`
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

/** An overhead against the cluster's: red when 40+ ms more. */
const slow = (mine: Num, theirs: Num) =>
  delayTone(mine, theirs) === 'danger' ? ' text-danger' : '';

/** One direction's cell: its overhead (red when 40+ ms over the
 *  cluster's), the cluster's on the same route under it; the median,
 *  count, 90th percentile and floor on hover. */
const OverheadCell = ({
  mine,
  cluster,
  median,
  side
}: {
  mine: Num;
  cluster: Num;
  median: Num;
  side: Side;
}) => (
  <td
    className="text-end font-monospace"
    title={[median != null && `median ${ms(median)}`, about(side)]
      .filter(Boolean)
      .join(' · ')}
  >
    <span className={slow(mine, cluster).trim() || undefined}>
      {signedMs(mine)}
    </span>
    <span className="d-block fs-10 fw-normal text-body-tertiary">
      cluster {signedMs(cluster)}
    </span>
  </td>
);

/**
 * Its handoffs for an epoch in one phone-width table: all of them, then by
 * where the other leader was - the median from the previous leader, its
 * overhead (the median less its first block and the floor: the
 * notarization floor for All, the direct one by region, where only the
 * cluster has notarization floors), the overhead to the next leader
 * where the API has it, and the cluster's on the same basis. Counts,
 * 90th percentiles and floors on hover.
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
  // don't give the overhead themselves.
  const slotMs = cluster?.inWindow?.p50Ms;
  const out = pace.handoffOut;
  const inBy = pace.handoffByRegion;
  const outBy = pace.handoffOutByRegion;
  const hasOut = !!out;
  const allIn = handoffExtra(pace, slotMs);
  const allOut = handoffExtra(pace, slotMs, 'out');
  const label = (n: boolean) => (n ? 'notarization floor' : 'direct floor');
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
      inSide: {
        ...it,
        expectedP50Ms: allIn.floorMs,
        floorLabel: label(allIn.notarized)
      },
      extraIn: allIn.extra,
      outSide: out
        ? {
            ...out,
            expectedP50Ms: allOut.floorMs,
            floorLabel: label(allOut.notarized)
          }
        : null,
      extraOut: allOut.extra,
      clusterExtra: handoffExtra(cluster, slotMs).extra
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
      info="To it: its first block after the previous leader's last. From it: the next leader's first block after its last. A handoff holds the receiving leader's first block (~144 ms: Agave ends it 56 ms before its slot is up) plus the wait before it can start: without Fast Leader Handover it starts only once the previous block is notarized - the block reaching the voters through Turbine, then 60% of stake's votes reaching it. The notarization floor is that trip at fibre speed, so the overhead (the median less its block and that floor) is what the model leaves out - replay, vote processing - plus its error; compare with the cluster's. By region: by where the other leader was, against the direct floor (the distance straight between the two) on both sides, as only the cluster has notarization floors by region - so these run higher than All. Epochs before the notarization floor was recorded use the direct floor throughout. Hover a figure for its count, 90th percentile and floor."
    >
      <Table size="sm" className="data-table compact-rows fs-9 mb-0">
        <thead>
          <tr>
            <th />
            <th
              className="text-end"
              title="Handoffs from the previous leader to it: its overhead (the median less its first block and the floor - notarization for All, direct by region), the cluster's on the same route below"
            >
              To it
            </th>
            {hasOut && (
              <th
                className="text-end"
                title="Handoffs from it to the next leader: its overhead, the cluster's on the same route below"
              >
                From it
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key} className={r.key === 'all' ? 'fw-semibold' : ''}>
              <td className="text-nowrap">{r.label}</td>
              <OverheadCell
                mine={r.extraIn}
                cluster={r.clusterExtra}
                median={r.median}
                side={r.inSide}
              />
              {hasOut && (
                <OverheadCell
                  mine={r.extraOut}
                  cluster={r.clusterOut ?? r.clusterExtra}
                  median={r.outSide?.p50Ms}
                  side={r.outSide}
                />
              )}
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
