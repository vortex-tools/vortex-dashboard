import DelayedSpinner from 'components/common/DelayedSpinner';
import SectionCard from 'components/common/SectionCard';
import UntrackedState from 'components/common/UntrackedState';
import { formatLamports } from 'helpers/utils';
import { TOP_BLOCKS, VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useEffect, useState } from 'react';
import { Table } from 'react-bootstrap';
import { Link } from 'react-router';

/**
 * A validator's biggest blocks of an epoch (/blocks/income?sort=income),
 * each against the blocks other leaders made around it: the income its
 * best blocks brought in, and how far above the neighbourhood they were.
 */
const TopBlocksCard = ({
  nodeAddress,
  epoch,
  current
}: {
  nodeAddress: string;
  epoch: number;
  current: boolean;
}) => {
  const context = useContext(VortexDataContext);
  const key = `${nodeAddress}:${epoch}`;
  const fetchTop = context?.topBlocksState.fetchData;
  useEffect(() => {
    fetchTop?.(key);
  }, [fetchTop, key]);
  const rows = context?.topBlocksState.data.get(key);
  const failed = !!context?.topBlocksState.error && rows === undefined;
  // A failed load (a slow moment, an API restart) retries once by itself,
  // then on request.
  const [retried, setRetried] = useState(false);
  const retry = () => {
    context?.topBlocksState.clearError();
    fetchTop?.(key, { force: true });
  };
  useEffect(() => {
    if (failed && !retried) {
      setRetried(true);
      retry();
    }
  }, [failed, retried]);

  return (
    <SectionCard
      title={`Biggest Blocks · ${current ? 'this epoch' : `epoch ${epoch}`}`}
      icon="zap"
      info="Its highest-earning blocks (fees + tips), and each against the median of other leaders' blocks within 100 slots: how far above the moment's going rate it was."
    >
      {rows === undefined ? (
        failed ? (
          <UntrackedState>
            Couldn&apos;t load its blocks.{' '}
            <button type="button" className="btn btn-link p-0" onClick={retry}>
              Retry
            </button>
          </UntrackedState>
        ) : (
          <DelayedSpinner loading label="Loading its blocks…" />
        )
      ) : !rows.length ? (
        <UntrackedState>No blocks yet.</UntrackedState>
      ) : (
        <Table
          responsive
          size="sm"
          className="data-table compact-rows fs-9 mb-0"
        >
          <thead>
            <tr>
              <th>Slot</th>
              <th className="text-end">Total</th>
              <th className="text-end d-none d-sm-table-cell">Fees</th>
              <th className="text-end d-none d-sm-table-cell">Tips</th>
              <th
                className="text-end"
                title="Its fees over the median of other leaders' blocks within 100 slots"
              >
                vs Around It
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, TOP_BLOCKS).map(r => {
              const i = r.income;
              const fees = i ? i.baseFees + i.priorityFees : null;
              const total = i ? i.baseFees + i.priorityFees + i.mevTips : null;
              const base = r.baselineIncome?.total;
              return (
                <tr key={r.slot}>
                  <td className="font-monospace">
                    <Link to={`/slot/${r.slot}`}>
                      {r.slot.toLocaleString()}
                    </Link>
                  </td>
                  <td className="text-end font-monospace fw-semibold">
                    {total != null ? formatLamports(total, 4) : '—'}
                  </td>
                  <td className="text-end font-monospace text-body-secondary d-none d-sm-table-cell">
                    {fees != null ? formatLamports(fees, 4) : '—'}
                  </td>
                  <td className="text-end font-monospace text-body-secondary d-none d-sm-table-cell">
                    {i ? formatLamports(i.mevTips, 4) : '—'}
                  </td>
                  <td
                    className="text-end font-monospace"
                    title={
                      base != null
                        ? `The blocks around it: ${formatLamports(base, 4)} (median)`
                        : undefined
                    }
                  >
                    {total != null && base ? (
                      `${(total / base).toFixed(1)}×`
                    ) : (
                      <span className="text-body-quaternary">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </SectionCard>
  );
};

export default TopBlocksCard;
