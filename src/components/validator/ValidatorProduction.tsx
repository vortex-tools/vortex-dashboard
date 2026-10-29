import DelayedSpinner from 'components/common/DelayedSpinner';
import UntrackedState from 'components/common/UntrackedState';
import { recordPath } from 'components/validator/ConsensusRecordHeader';
import SectionCard from 'components/common/SectionCard';
import {
  MIN_LEADER_SLOTS,
  producerSlots,
  productionInclusion
} from 'helpers/consensusBoards';
import { formatLamports } from 'helpers/utils';
import useLiveRefresh from 'hooks/useLiveRefresh';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { ProducerLeaderboardRecord } from 'providers/vortex-schemas';
import { useContext, useEffect } from 'react';
import { Table } from 'react-bootstrap';
import { Link } from 'react-router';

const REFRESH_MS = 60_000;
/** Epochs listed on the Overview. */
const ROWS = 10;

const pct = (v: number | null | undefined) =>
  v == null ? '—' : `${(v * 100).toFixed(2)}%`;
const Dash = () => <span className="text-body-tertiary">—</span>;

/**
 * Production card for the validator page (Alpenglow clusters), beside the
 * Consensus (voting) card: per epoch, newest first, its producing rank,
 * leader slots, skip rate, inclusion (of online stake) and producer bonus, from
 * /epochs/production (every producer ranked by the board). Each epoch
 * links to its consensus record's Producing section.
 */
const ValidatorProduction = ({
  voteAddress,
  nodeAddress
}: {
  voteAddress: string;
  nodeAddress: string;
}) => {
  const context = useContext(VortexDataContext);
  const currentEpoch = context?.currentEpochState.epoch ?? null;
  const history = context?.productionHistoryState;
  const fetchHistory = history?.fetchData;
  const served = history?.data.get(voteAddress);
  const historyFailed = !served && !history?.isLoading && !!history?.error;
  useEffect(() => {
    if (voteAddress) fetchHistory?.(voteAddress);
  }, [voteAddress, fetchHistory]);

  // Refreshed while shown; a failed read (the API down) retries then too.
  useLiveRefresh(currentEpoch != null, REFRESH_MS, () => {
    fetchHistory?.(voteAddress, { force: true });
  });

  const rows: Array<{
    epoch: number;
    record: ProducerLeaderboardRecord | undefined;
    rank: number | null;
    rankedOf: number | null;
  }> = served
    ? // Every epoch from its oldest record to now: the API only returns
      // epochs it led in, so a stretch without leader slots (offline,
      // out of the schedule) would vanish rather than show.
      (() => {
        const byEpoch = new Map(served.map(r => [r.epoch, r]));
        const newest = Math.max(
          currentEpoch ?? -Infinity,
          ...served.map(r => r.epoch)
        );
        const oldest = Math.min(...served.map(r => r.epoch));
        if (!served.length || !Number.isFinite(newest)) return [];
        return Array.from({ length: newest - oldest + 1 }, (_, i) => {
          const r = byEpoch.get(newest - i);
          return {
            epoch: newest - i,
            record: r,
            rank: r?.rank ?? null,
            rankedOf: r?.rankedOf ?? null
          };
        });
      })()
    : [];
  const anyLoaded = rows.length > 0 || (!!served && served.length === 0);

  return (
    <SectionCard
      title="Production"
      icon="box"
      linkTo={recordPath(nodeAddress || voteAddress, null, 'blocks')}
      linkLabel="Production record"
    >
      {historyFailed ? (
        <UntrackedState>
          Production isn&apos;t available right now.
        </UntrackedState>
      ) : !anyLoaded ? (
        <DelayedSpinner loading label="Loading production…" />
      ) : (
        <Table responsive size="sm" className="data-table fs-9 mb-0">
          <thead className="text-nowrap">
            <tr>
              <th>Epoch</th>
              <th
                className="text-end"
                title="Rank by inclusion (of online stake) among the epoch's producers with 20+ leader slots"
              >
                Rank
              </th>
              <th className="text-end" title="Blocks produced / leader slots">
                Leader slots
              </th>
              <th className="text-end">Skip rate</th>
              <th
                className="text-end"
                title="Producer bonus / the most its leader slots could earn carrying every online voter (voters in a 32+ slot offline run left out)"
              >
                Inclusion
              </th>
              <th
                className="text-end"
                title="Half of every vote its blocks carried (gross, before commission)"
              >
                Bonus
              </th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr>
                <td colSpan={6} className="text-center text-body-tertiary">
                  No leader slots in recent epochs.
                </td>
              </tr>
            )}
            {/* The newest ROWS epochs; the Production record has them all. */}
            {rows.slice(0, ROWS).map(({ epoch, record, rank, rankedOf }) => (
              <tr key={epoch}>
                <td className="text-nowrap">
                  <Link
                    to={recordPath(nodeAddress || voteAddress, epoch, 'blocks')}
                  >
                    {epoch}
                  </Link>
                  {epoch === currentEpoch && (
                    <span className="text-body-tertiary fs-10 ms-1">
                      (current)
                    </span>
                  )}
                </td>
                {!record ? (
                  <td colSpan={5} className="text-end text-body-tertiary">
                    No leader slots
                  </td>
                ) : (
                  <>
                    <td
                      className="text-end font-monospace"
                      title={
                        rank != null && rankedOf != null
                          ? `of ${rankedOf.toLocaleString()} producers`
                          : undefined
                      }
                    >
                      {rank != null &&
                      producerSlots(record) >= MIN_LEADER_SLOTS ? (
                        rank + 1
                      ) : (
                        <span
                          className="text-body-quaternary"
                          title="No leader slots: not ranked"
                        >
                          N/A
                        </span>
                      )}
                    </td>
                    <td className="text-end font-monospace text-nowrap">
                      {record.blocks.toLocaleString()} /{' '}
                      {(record.blocks + record.skippedSlots).toLocaleString()}
                    </td>
                    <td
                      className={`text-end font-monospace${record.skippedSlots > 0 ? ' text-danger fw-semibold' : ''}`}
                    >
                      {pct(record.skipRate)}
                    </td>
                    <td className="text-end font-monospace text-success fw-semibold">
                      {pct(productionInclusion(record))}
                    </td>
                    <td className="text-end font-monospace text-nowrap">
                      {record.producerBonusLamports != null ? (
                        formatLamports(record.producerBonusLamports, 2)
                      ) : (
                        <Dash />
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </SectionCard>
  );
};

export default ValidatorProduction;
