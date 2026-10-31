import { OFFLINE_RUN_SLOTS, OUTCOME } from 'helpers/participation';
import ValidatorLink from 'components/common/ValidatorLink';
import { ProducerLeaderboardRecord } from 'providers/vortex-schemas';
import { useMemo } from 'react';
import { Table } from 'react-bootstrap';
import {
  NeverReachesBadge,
  UnreachableSummary,
  neverReaches
} from './Unreachable';

const TOP = 8;
// A producer whose blocks carried this much less than the cluster's mean
// included stake leaves many voters out, not just this one.
const THIN_GAP = 0.02;
// Misses concentrated in one producer's windows (enough of them, and a
// real share of the slots it paid): something between the two.
const CONCENTRATED_MIN = 5;
const CONCENTRATED_RATE = 0.01;

const pct = (v: number | null) =>
  v == null ? '—' : `${(v * 100).toFixed(2)}%`;

/**
 * A voter's missed slots grouped by who would have paid them: slot s's
 * votes are paid from the reward certificates in the slot + 8 leader's
 * block, so a vote missing there is missing from that producer's
 * certificate. Against each producer: this voter's miss rate in its
 * windows, and how much voting stake the producer's blocks carried for
 * everyone - a producer that's thin for everyone points at the producer;
 * one that's fine for everyone else points at the voter.
 */
const MissedByProducer = ({
  codes,
  firstSlot,
  leaderOf,
  producers,
  clusterInclusion,
  selfNode,
  nameOf
}: {
  codes: Uint8Array;
  firstSlot: number;
  leaderOf: (slot: number) => string | null;
  /** The epoch's producer records, by node address. */
  producers: Map<string, ProducerLeaderboardRecord>;
  /** The cluster's mean included stake (0-1). */
  clusterInclusion: number | null;
  selfNode: string | null;
  nameOf: (node: string) => string;
}) => {
  const groups = useMemo(() => {
    const by = new Map<
      string,
      {
        eligible: number;
        missed: number;
        liveSlots: number;
        liveMissed: number;
      }
    >();
    let totalMissed = 0;
    let totalEligible = 0;
    // Slots in an offline run (>= OFFLINE_RUN_SLOTS consecutive misses;
    // ineligible slots don't break a run) aren't counted for 'never
    // reaches': being offline
    // would otherwise brand every producer that led during it.
    const offline = new Uint8Array(codes.length);
    let runStart = -1;
    let runLen = 0;
    const close = (end: number) => {
      if (runLen >= OFFLINE_RUN_SLOTS)
        for (let k = runStart; k < end; k++)
          if (codes[k] === OUTCOME.missed) offline[k] = 1;
      runStart = -1;
      runLen = 0;
    };
    for (let i = 0; i < codes.length; i++) {
      if (codes[i] === OUTCOME.missed) {
        if (runStart < 0) runStart = i;
        runLen += 1;
      } else if (codes[i] !== OUTCOME.ineligible) close(i);
    }
    close(codes.length);
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === OUTCOME.ineligible) continue;
      const payer = leaderOf(firstSlot + i + 8);
      if (!payer) continue;
      const g = by.get(payer) ?? {
        eligible: 0,
        missed: 0,
        liveSlots: 0,
        liveMissed: 0
      };
      g.eligible += 1;
      totalEligible += 1;
      if (!offline[i]) g.liveSlots += 1;
      if (c === OUTCOME.missed) {
        g.missed += 1;
        totalMissed += 1;
        if (!offline[i]) g.liveMissed += 1;
      }
      by.set(payer, g);
    }
    const rows = [...by.entries()]
      .filter(([, g]) => g.missed > 0)
      .sort((a, b) => b[1].missed - a[1].missed);
    const unreachable = rows.filter(([, g]) =>
      neverReaches(g.liveMissed, g.liveSlots)
    );
    return { rows, totalMissed, totalEligible, unreachable };
  }, [codes, firstSlot, leaderOf]);

  if (!groups.totalMissed)
    return (
      <p className="fs-9 text-body-tertiary mb-0">
        No missed slots this epoch.
      </p>
    );
  // The top producers by misses, plus every unreachable one.
  const shown = (i: number, g: { liveMissed: number; liveSlots: number }) =>
    i < TOP || neverReaches(g.liveMissed, g.liveSlots);
  const top = groups.rows.filter(([, g], i) => shown(i, g));
  const rest = groups.rows.filter(([, g], i) => !shown(i, g));
  const restMissed = rest.reduce((a, [, g]) => a + g.missed, 0);
  const overallRate = groups.totalMissed / groups.totalEligible;
  return (
    <>
      <UnreachableSummary
        producers={groups.unreachable.length}
        missed={groups.unreachable.reduce((a, [, g]) => a + g.liveMissed, 0)}
      />
      <Table responsive size="sm" className="data-table fs-9 mb-2">
        <thead>
          <tr>
            <th>Reward leader (slot + 8)</th>
            <th className="text-end">Missed</th>
            <th
              className="text-end"
              title="Its missed slots / its slots this leader's blocks rewarded"
            >
              Miss rate there
            </th>
            <th
              className="text-end"
              title="Mean voting stake the producer's blocks carried, for all voters"
            >
              Its inclusion
            </th>
            <th>Likely cause</th>
          </tr>
        </thead>
        <tbody>
          {top.map(([node, g]) => {
            const p = producers.get(node);
            const inclusion =
              p?.meanIncludedStakePpb != null
                ? p.meanIncludedStakePpb / 1e9
                : null;
            const thin =
              inclusion != null &&
              clusterInclusion != null &&
              inclusion < clusterInclusion - THIN_GAP;
            const rate = g.missed / g.eligible;
            return (
              <tr key={node}>
                <td className="text-nowrap">
                  <ValidatorLink address={node}>{nameOf(node)}</ValidatorLink>
                  {node === selfNode && (
                    <span className="text-body-tertiary"> (self)</span>
                  )}
                  {neverReaches(g.liveMissed, g.liveSlots) && (
                    <NeverReachesBadge />
                  )}
                </td>
                <td className="text-end font-monospace">
                  {g.missed.toLocaleString()}
                </td>
                <td className="text-end font-monospace">{pct(rate)}</td>
                <td
                  className={`text-end font-monospace${thin ? ' text-warning' : ''}`}
                >
                  {pct(inclusion)}
                </td>
                <td className="text-nowrap fs-10">
                  {thin ? (
                    <span className="text-warning">
                      Producer: thin certificates for everyone
                    </span>
                  ) : g.missed >= CONCENTRATED_MIN &&
                    rate >= CONCENTRATED_RATE ? (
                    <span>Concentrated with this producer</span>
                  ) : (
                    <span className="text-body-tertiary">Scattered</span>
                  )}
                </td>
              </tr>
            );
          })}
          {restMissed > 0 && (
            <tr>
              <td className="text-body-tertiary">
                {rest.length.toLocaleString()} other producers
              </td>
              <td className="text-end font-monospace">
                {restMissed.toLocaleString()}
              </td>
              <td colSpan={3} />
            </tr>
          )}
        </tbody>
      </Table>
      <p className="fs-10 text-body-tertiary mb-0">
        {groups.totalMissed.toLocaleString()} missed of{' '}
        {groups.totalEligible.toLocaleString()} slots ({pct(overallRate)}). A
        slot&apos;s votes are rewarded by the reward certificates in its reward
        block (slot + 8), so a miss is a vote missing from that block&apos;s
        certificate.
        {clusterInclusion != null &&
          ` Cluster inclusion ${pct(clusterInclusion)}.`}
      </p>
    </>
  );
};

export default MissedByProducer;
