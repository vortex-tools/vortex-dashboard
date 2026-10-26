import { ColumnDef } from '@tanstack/react-table';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import AmountWithDelta from 'components/common/AmountWithDelta';
import { formatLamports } from 'helpers/utils';
import {
  EpochIncomeLeaderboardRecord,
  IDEAL_RECORD_KEY
} from 'providers/VortexDataProvider';
import { Link } from 'react-router';

type IncomeKey = 'baseFees' | 'priorityFees' | 'mevTips';

// Sum selected keys from an IncomeDetails object.
const sumKeys = (
  income: EpochIncomeLeaderboardRecord['medianIncome'],
  keys: IncomeKey[]
): number => keys.reduce((acc, k) => acc + income[k], 0);

/** Mean income per block: the epoch's total over its blocks (null: none). */
export const meanPerBlock = (r: {
  totalIncome: EpochIncomeLeaderboardRecord['totalIncome'];
  confirmedSlots: number;
  meanIncome?: EpochIncomeLeaderboardRecord['meanIncome'];
}) =>
  r.meanIncome
    ? sumKeys(r.meanIncome, ['baseFees', 'priorityFees', 'mevTips'])
    : r.confirmedSlots > 0
      ? sumKeys(r.totalIncome, ['baseFees', 'priorityFees', 'mevTips']) /
        r.confirmedSlots
      : null;

const Dash = () => <span className="text-body-quaternary">—</span>;
const sol4 = (v: number | null) =>
  v == null ? (
    <Dash />
  ) : (
    <span className="font-monospace">{formatLamports(v, 4)}</span>
  );

/** "3 · 1.8%": skipped leader slots and their share of its leader slots. */
export const SkippedCell = ({
  skipped,
  produced
}: {
  skipped: number;
  produced: number;
}) => {
  const slots = skipped + produced;
  if (!slots) return <Dash />;
  if (!skipped)
    return <span className="font-monospace text-body-quaternary">0</span>;
  const pct = (skipped / slots) * 100;
  return (
    <span
      className="font-monospace text-nowrap"
      title={`${skipped.toLocaleString()} of its ${slots.toLocaleString()} leader slots skipped (${pct < 0.1 ? '<0.1' : pct.toFixed(1)}%): no block, no income`}
    >
      {skipped.toLocaleString()}
    </span>
  );
};

export const MISSED_TITLE =
  'Estimated income its skipped leader slots cost it: what the blocks other leaders made around them earned';

/** What its skipped slots would have earned (lamports): the blocks other
 *  leaders made around them, summed - the income the skips cost it. */
export const MissedCell = ({
  missed
}: {
  missed: number | null | undefined;
}) =>
  missed == null ? (
    <Dash />
  ) : !missed ? (
    <span className="font-monospace text-body-quaternary">0</span>
  ) : (
    <span className="font-monospace text-nowrap" title={MISSED_TITLE}>
      <span
        className="d-inline-block rounded-circle bg-warning me-1 align-middle"
        style={{ width: 6, height: 6 }}
        aria-hidden
      />
      {formatLamports(missed, 2)}
    </span>
  );

/** Fewer blocks than this: too few to rank by capture. */
export const MIN_CAPTURE_BLOCKS = 20;

export const CAPTURE_TITLE =
  'Its typical block against the blocks other leaders made around it (within 100 slots): 1.00× earns like them. Cancels out when its slots fell - busy hours or quiet - so it measures its block building (fees) and block-engine setup (tips).';

/** "1.08× ▲": a capture ratio in plain text, a small green ▲ above 1
 *  and red ▼ well below it (no colored numbers). */
export const CaptureCell = ({
  value,
  blocks,
  strong = false
}: {
  value: number | null | undefined;
  blocks?: number | null;
  strong?: boolean;
}) =>
  value == null ? (
    <span className="text-body-quaternary">—</span>
  ) : (
    <span
      className={`font-monospace text-nowrap${strong ? ' fw-semibold' : ''}`}
      title={
        blocks != null ? `Over ${blocks.toLocaleString()} blocks` : undefined
      }
    >
      {value.toFixed(2)}×
      <span
        className={`fs-10 ms-1 ${value >= 1.005 ? 'text-success' : value < 0.95 ? 'text-danger' : 'invisible'}`}
        aria-hidden
      >
        {value >= 1.005 ? '▲' : '▼'}
      </span>
    </span>
  );

export const createIncomeLeaderboardTableColumns = (
  clusterRecord: EpochIncomeLeaderboardRecord | undefined,
  /** The cluster's mean income per block (all blocks). */
  clusterMean: number | null,
  /** Capture served: rank and compare by it (else by the median). */
  capture = false,
  /** Each validator's rank (null: too few blocks); else the row order. */
  rankOf?: Map<string, number | null>
): ColumnDef<EpochIncomeLeaderboardRecord>[] => {
  const clusterTotal = clusterRecord
    ? sumKeys(clusterRecord.medianIncome, [
        'baseFees',
        'priorityFees',
        'mevTips'
      ])
    : undefined;
  const isCluster = (r: EpochIncomeLeaderboardRecord) =>
    r.nodeAddress === IDEAL_RECORD_KEY;

  return capture
    ? [
        {
          id: 'rank',
          accessorFn: (row, index) =>
            rankOf ? (rankOf.get(row.nodeAddress) ?? Infinity) : index + 1,
          header: 'Rank',
          cell: ({ row, getValue }) => {
            if (isCluster(row.original)) return '';
            if (rankOf) {
              const r = rankOf.get(row.original.nodeAddress);
              return r == null ? (
                <span
                  className="text-body-quaternary"
                  title={`Fewer than ${MIN_CAPTURE_BLOCKS} blocks: too few to rank`}
                >
                  —
                </span>
              ) : (
                r
              );
            }
            // IDEAL_RECORD_KEY sits at index 0 in tableData, so non-IDEAL
            // row indices already shift up by one — accessor's index+1
            // would over-count by one. Subtract IDEAL's slot.
            return getValue<number>() - 1;
          },
          meta: { cellProps: { className: 'text-body' } }
        },
        {
          accessorKey: 'nodeName',
          header: 'Validator',
          cell: ({ row }) => {
            if (isCluster(row.original)) {
              return <span className="fw-semibold">Cluster</span>;
            }
            return (
              <Link to={`/validator/${row.original.nodeAddress}/block-income`}>
                {row.original.nodeName || row.original.nodeAddress}
              </Link>
            );
          },
          meta: { cellProps: { className: 'text-body' } }
        },
        {
          // Hidden but searchable: keeps full-text search working for
          // someone pasting in a node address.
          accessorKey: 'nodeAddress',
          header: 'Validator Address (hidden)',
          meta: {
            cellProps: { className: 'd-none' },
            headerProps: { className: 'd-none' }
          }
        },
        {
          accessorKey: 'confirmedSlots',
          header: 'Blocks',
          cell: ({ getValue, row }) =>
            isCluster(row.original) ? (
              <Dash />
            ) : (
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
          cell: ({ row }) =>
            isCluster(row.original) ? (
              <Dash />
            ) : (
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
          id: 'missed',
          accessorFn: row => row.missedToSkipsLamports ?? -1,
          header: 'Missed',
          cell: ({ row }) =>
            isCluster(row.original) ? (
              <Dash />
            ) : (
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
          cell: ({ row }) =>
            isCluster(row.original) ? (
              <span className="font-monospace fw-semibold">1.00×</span>
            ) : (
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
          cell: ({ row }) =>
            isCluster(row.original) ? (
              ''
            ) : (
              <CaptureCell value={row.original.captureFees} />
            ),
          meta: {
            cellProps: { className: 'text-body d-none d-md-table-cell' },
            headerProps: {
              className: 'd-none d-md-table-cell',
              title:
                'Capture of base + priority fees: what its block packing earns'
            }
          }
        },
        {
          id: 'captureTips',
          accessorFn: row => row.captureTips ?? -1,
          header: 'Tips',
          cell: ({ row }) =>
            isCluster(row.original) ? (
              ''
            ) : (
              <CaptureCell value={row.original.captureTips} />
            ),
          meta: {
            cellProps: { className: 'text-body d-none d-md-table-cell' },
            headerProps: {
              className: 'd-none d-md-table-cell',
              title: 'Capture of MEV tips: what its block-engine setup earns'
            }
          }
        },
        {
          id: 'meanTotal',
          accessorFn: row =>
            isCluster(row) ? (clusterMean ?? 0) : (meanPerBlock(row) ?? 0),
          header: 'Mean / Block',
          cell: ({ row }) =>
            sol4(
              isCluster(row.original) ? clusterMean : meanPerBlock(row.original)
            ),
          meta: {
            cellProps: { className: 'text-body' },
            headerProps: {
              title:
                'Its epoch income over its blocks: counts the big blocks the median leaves out'
            }
          }
        },
        {
          id: 'epochTotal',
          accessorFn: row =>
            sumKeys(row.totalIncome, ['baseFees', 'priorityFees', 'mevTips']),
          header: 'Epoch Income',
          cell: ({ getValue, row }) =>
            isCluster(row.original) ? (
              <Dash />
            ) : (
              <span className="font-monospace">
                {formatLamports(getValue<number>(), 2)}
              </span>
            ),
          meta: {
            cellProps: { className: 'text-body text-end border-start' },
            headerProps: {
              className: 'border-start text-end',
              title:
                "All its blocks' fees + tips this epoch (gross, before commission)"
            }
          }
        },
        {
          id: 'client',
          accessorFn: row =>
            [row.softwareBase, row.softwareFlavor]
              .filter(Boolean)
              .join(' · ') || '—',
          header: 'Client',
          cell: ({ getValue, row }) => (
            <span
              className="text-nowrap"
              title={row.original.softwareVersion ?? undefined}
            >
              {isCluster(row.original) ? '' : getValue<string>()}
            </span>
          ),
          meta: { cellProps: { className: 'text-body' } }
        }
      ]
    : [
        {
          id: 'rank',
          accessorFn: (row, index) =>
            rankOf ? (rankOf.get(row.nodeAddress) ?? Infinity) : index + 1,
          header: 'Rank',
          cell: ({ row, getValue }) => {
            if (isCluster(row.original)) return '';
            if (rankOf) {
              const r = rankOf.get(row.original.nodeAddress);
              return r == null ? (
                <span
                  className="text-body-quaternary"
                  title={`Fewer than ${MIN_CAPTURE_BLOCKS} blocks: too few to rank`}
                >
                  —
                </span>
              ) : (
                r
              );
            }
            // IDEAL_RECORD_KEY sits at index 0 in tableData, so non-IDEAL
            // row indices already shift up by one — accessor's index+1
            // would over-count by one. Subtract IDEAL's slot.
            return getValue<number>() - 1;
          },
          meta: { cellProps: { className: 'text-body' } }
        },
        {
          accessorKey: 'nodeName',
          header: 'Validator',
          cell: ({ row }) => {
            if (isCluster(row.original)) {
              return <span className="fw-semibold">Cluster</span>;
            }
            return (
              <Link to={`/validator/${row.original.nodeAddress}/block-income`}>
                {row.original.nodeName || row.original.nodeAddress}
              </Link>
            );
          },
          meta: { cellProps: { className: 'text-body' } }
        },
        {
          // Hidden but searchable: keeps full-text search working for
          // someone pasting in a node address.
          accessorKey: 'nodeAddress',
          header: 'Validator Address (hidden)',
          meta: {
            cellProps: { className: 'd-none' },
            headerProps: { className: 'd-none' }
          }
        },
        {
          accessorKey: 'confirmedSlots',
          header: 'Blocks',
          cell: ({ getValue, row }) =>
            isCluster(row.original) ? (
              <Dash />
            ) : (
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
          cell: ({ row }) =>
            isCluster(row.original) ? (
              <Dash />
            ) : (
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
          accessorFn: row =>
            sumKeys(row.medianIncome, ['baseFees', 'priorityFees', 'mevTips']),
          header: 'Median / Block',
          cell: ({ getValue, row }) =>
            isCluster(row.original) ? (
              <span className="font-monospace fw-semibold">
                {formatLamports(getValue<number>(), 4)}
              </span>
            ) : (
              <AmountWithDelta
                value={getValue<number>()}
                baseline={clusterTotal}
                digits={4}
              />
            ),
          meta: {
            cellProps: { className: 'text-body fw-semibold border-start' },
            headerProps: {
              className: 'border-start',
              title:
                'Fees + tips of its typical block (the median), vs the cluster median'
            }
          }
        },
        {
          id: 'meanTotal',
          accessorFn: row =>
            isCluster(row) ? (clusterMean ?? 0) : (meanPerBlock(row) ?? 0),
          header: 'Mean / Block',
          cell: ({ row }) =>
            sol4(
              isCluster(row.original) ? clusterMean : meanPerBlock(row.original)
            ),
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
          accessorFn: row =>
            sumKeys(row.totalIncome, ['baseFees', 'priorityFees', 'mevTips']),
          header: 'Epoch Income',
          cell: ({ getValue, row }) =>
            isCluster(row.original) ? (
              <Dash />
            ) : (
              <span className="font-monospace">
                {formatLamports(getValue<number>(), 2)}
              </span>
            ),
          meta: {
            cellProps: { className: 'text-body text-end border-start' },
            headerProps: {
              className: 'border-start text-end',
              title:
                "All its blocks' fees + tips this epoch (gross, before commission)"
            }
          }
        },
        {
          id: 'client',
          accessorFn: row =>
            [row.softwareBase, row.softwareFlavor]
              .filter(Boolean)
              .join(' · ') || '—',
          header: 'Client',
          cell: ({ getValue, row }) => (
            <span
              className="text-nowrap"
              title={row.original.softwareVersion ?? undefined}
            >
              {isCluster(row.original) ? '' : getValue<string>()}
            </span>
          ),
          meta: { cellProps: { className: 'text-body' } }
        }
      ];
};

const EpochIncomeLeaderboardTable = () => {
  return (
    <div>
      <AdvanceTable
        tableProps={{
          className: 'data-table fs-9 table-striped table-with-padding'
        }}
      />
      <AdvanceTableFooter />
    </div>
  );
};

export default EpochIncomeLeaderboardTable;
