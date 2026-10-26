import { ColumnDef } from '@tanstack/react-table';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import AmountWithDelta from 'components/common/AmountWithDelta';
import { EpochIncome } from 'providers/VortexDataProvider';
import { formatLamports, hasMissingBlockData } from 'helpers/utils';
import {
  CAPTURE_TITLE,
  CaptureCell,
  meanPerBlock,
  MISSED_TITLE,
  MissedCell,
  SkippedCell
} from 'components/tables/EpochIncomeLeaderboardTable';

type IncomeKey = 'baseFees' | 'priorityFees' | 'mevTips';

const sumKeys = (
  income: EpochIncome['medianIncome'],
  keys: IncomeKey[]
): number => keys.reduce((acc, k) => acc + income[k], 0);

export const createEpochIncomeTableColumns = (
  clusterData: EpochIncome[],
  /** Capture served: a Capture column for the median one. */
  capture = false
): ColumnDef<EpochIncome>[] => {
  const clusterForEpoch = (epoch: number) =>
    clusterData.find(r => r.epoch === epoch);
  const total = (i: EpochIncome['medianIncome']) =>
    sumKeys(i, ['baseFees', 'priorityFees', 'mevTips']);

  const columns: ColumnDef<EpochIncome>[] = [
    {
      accessorKey: 'epoch',
      header: 'Epoch',
      cell: ({ row }) => {
        const { epoch } = row.original;
        return (
          <>
            {epoch}
            {hasMissingBlockData(epoch) && (
              <span className="text-body-tertiary fs-10 ms-1">
                (missing data)
              </span>
            )}
          </>
        );
      },
      meta: { cellProps: { className: 'text-body' } }
    },
    {
      accessorKey: 'confirmedSlots',
      header: 'Blocks',
      cell: ({ getValue }) => (
        <span className="font-monospace">
          {getValue<number>().toLocaleString()}
        </span>
      ),
      meta: {
        cellProps: { className: 'text-body text-end' },
        headerProps: { className: 'text-end' }
      }
    },
    {
      id: 'skipped',
      accessorFn: row => row.skippedSlots,
      header: 'Skipped',
      cell: ({ row }) => (
        <SkippedCell
          skipped={row.original.skippedSlots}
          produced={row.original.confirmedSlots}
        />
      ),
      meta: {
        cellProps: { className: 'text-body text-end' },
        headerProps: {
          className: 'text-end',
          title: 'Leader slots with no block: income it never earned'
        }
      }
    },
    {
      id: 'medianTotal',
      accessorFn: row => total(row.medianIncome),
      header: 'Median / Block',
      cell: ({ getValue, row }) => {
        const cluster = clusterForEpoch(row.original.epoch);
        return (
          <AmountWithDelta
            value={getValue<number>()}
            baseline={cluster ? total(cluster.medianIncome) : undefined}
            digits={4}
          />
        );
      },
      meta: {
        cellProps: { className: 'text-body fw-semibold border-start' },
        headerProps: {
          className: 'border-start',
          title:
            'Fees + tips of its typical block (the median), vs the cluster median that epoch'
        }
      }
    },
    {
      id: 'meanTotal',
      accessorFn: row => meanPerBlock(row) ?? 0,
      header: 'Mean / Block',
      cell: ({ row }) => {
        const m = meanPerBlock(row.original);
        return m == null ? (
          '—'
        ) : (
          <span className="font-monospace">{formatLamports(m, 4)}</span>
        );
      },
      meta: {
        cellProps: { className: 'text-body' },
        headerProps: {
          title:
            'Its epoch income over its blocks: counts the big blocks the median leaves out'
        }
      }
    },
    {
      id: 'medianFees',
      accessorFn: row =>
        sumKeys(row.medianIncome, ['baseFees', 'priorityFees']),
      header: 'Fees',
      cell: ({ getValue }) => (
        <span className="font-monospace text-body-secondary">
          {formatLamports(getValue<number>(), 4)}
        </span>
      ),
      meta: {
        cellProps: { className: 'text-body d-none d-lg-table-cell' },
        headerProps: {
          className: 'd-none d-lg-table-cell',
          title: 'Median base + priority fees per block'
        }
      }
    },
    {
      id: 'medianTips',
      accessorFn: row => row.medianIncome.mevTips,
      header: 'Tips',
      cell: ({ getValue }) => (
        <span className="font-monospace text-body-secondary">
          {formatLamports(getValue<number>(), 4)}
        </span>
      ),
      meta: {
        cellProps: { className: 'text-body d-none d-lg-table-cell' },
        headerProps: {
          className: 'd-none d-lg-table-cell',
          title: 'Median MEV tips per block'
        }
      }
    },
    {
      id: 'epochTotal',
      accessorFn: row => total(row.totalIncome),
      header: 'Epoch Income',
      cell: ({ getValue }) => (
        <span className="font-monospace">
          {formatLamports(getValue<number>(), 2)}
        </span>
      ),
      meta: {
        cellProps: { className: 'text-body text-end border-start' },
        headerProps: {
          className: 'border-start text-end',
          title: "All its blocks' fees + tips (gross, before commission)"
        }
      }
    }
  ];
  if (!capture) return columns;
  // Capture for the median (and its badge); the fees / tips split as
  // capture too.
  const captureCols: ColumnDef<EpochIncome>[] = [
    {
      id: 'missed',
      accessorFn: row => row.missedToSkipsLamports ?? -1,
      header: 'Missed',
      cell: ({ row }) => (
        <MissedCell missed={row.original.missedToSkipsLamports} />
      ),
      meta: {
        cellProps: { className: 'text-body text-end' },
        headerProps: { className: 'text-end', title: MISSED_TITLE }
      }
    },
    {
      id: 'capture',
      accessorFn: row => row.captureTotal ?? -1,
      header: 'Capture',
      cell: ({ row }) => (
        <CaptureCell
          value={row.original.captureTotal}
          blocks={row.original.captureBlocks}
          strong
        />
      ),
      meta: {
        cellProps: { className: 'text-body border-start' },
        headerProps: { className: 'border-start', title: CAPTURE_TITLE }
      }
    },
    {
      id: 'captureFees',
      accessorFn: row => row.captureFees ?? -1,
      header: 'Fees',
      cell: ({ row }) => <CaptureCell value={row.original.captureFees} />,
      meta: {
        cellProps: { className: 'text-body d-none d-md-table-cell' },
        headerProps: { className: 'd-none d-md-table-cell' }
      }
    },
    {
      id: 'captureTips',
      accessorFn: row => row.captureTips ?? -1,
      header: 'Tips',
      cell: ({ row }) => <CaptureCell value={row.original.captureTips} />,
      meta: {
        cellProps: { className: 'text-body d-none d-md-table-cell' },
        headerProps: { className: 'd-none d-md-table-cell' }
      }
    }
  ];
  const drop = new Set(['medianTotal', 'medianFees', 'medianTips']);
  const at = columns.findIndex(c => c.id === 'medianTotal');
  return [
    ...columns.slice(0, at),
    ...captureCols,
    ...columns.slice(at).filter(c => !drop.has(c.id ?? ''))
  ];
};

const EpochIncomeTable = () => {
  return (
    <div>
      <AdvanceTable
        tableProps={{
          className:
            'data-table compact-rows fs-9 table-striped table-with-padding'
        }}
      />
      <AdvanceTableFooter />
    </div>
  );
};

export default EpochIncomeTable;
