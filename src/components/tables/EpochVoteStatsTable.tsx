import { ColumnDef } from '@tanstack/react-table';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import { hasMissingBlockData } from 'helpers/utils';
import { EpochVoteStatsItem } from 'providers/VortexDataProvider';
import { Link } from 'react-router';
import { Table } from 'react-bootstrap';

export const createEpochVoteStatsTableColumns = (
  voteAddress: string,
  clusterData: EpochVoteStatsItem[],
  currentEpoch: number | null
): ColumnDef<EpochVoteStatsItem>[] => {
  const columns: ColumnDef<EpochVoteStatsItem>[] = [
    {
      accessorKey: 'epoch',
      header: 'Epoch',
      cell: ({ row }) => {
        const { epoch, lastUploadedBucket } = row.original;
        const isIncomplete = lastUploadedBucket < 431 && epoch > 700;
        const isCurrent = currentEpoch !== null && epoch === currentEpoch;
        const isMissingData = hasMissingBlockData(epoch);
        return (
          <>
            <Link to={`/validator/${voteAddress}/votes/epoch/${epoch}`}>
              {epoch}
            </Link>
            {isIncomplete && isCurrent && <span> (in progress)</span>}
            {isIncomplete && !isCurrent && <span> (backfilling)</span>}
            {isMissingData && <span> (missing data)</span>}
            {epoch === 703 && <span> (tvc activated)</span>}
          </>
        );
      },
      meta: {
        cellProps: { className: 'text-body' }
      }
    },
    {
      accessorKey: 'ranking',
      header: 'Rank',
      cell: ({ row }) => (
        <Link
          to={`/leaderboards/voting/epoch/${row.original.epoch}`}
          className="text-primary"
        >
          #{row.original.ranking}
        </Link>
      ),
      meta: {
        cellProps: { className: 'text-body' }
      }
    }
  ];

  const metricColumns: ColumnDef<EpochVoteStatsItem>[] = [
    {
      id: 'perfectPct',
      accessorFn: row => {
        const total =
          row.perfectSlots + row.okSlots + row.slowSlots + row.skippedSlots;
        return total === 0 ? 0 : (row.perfectSlots / total) * 100;
      },
      header: 'Perfect',
      cell: ({ getValue, row }) => {
        const pct = getValue<number>();
        const r = row.original;
        const total = r.perfectSlots + r.okSlots + r.slowSlots + r.skippedSlots;
        if (total === 0) return <span className="opacity-50">—</span>;
        const display = `${pct.toFixed(2)}%`;
        if (r.perfectSlots === 0) {
          return <span className="opacity-50">{display}</span>;
        }
        return display;
      },
      // border-start opens the metrics group visually.
      meta: {
        cellProps: { className: 'text-success fw-semibold border-start' },
        headerProps: { className: 'border-start' }
      }
    },
    {
      accessorKey: 'okSlots',
      header: 'Ok',
      cell: ({ getValue }) => {
        const v = getValue<number>();
        return v === 0 ? (
          <span className="opacity-50">{v}</span>
        ) : (
          v.toLocaleString()
        );
      },
      meta: {
        cellProps: { className: 'text-primary-emphasis fw-semibold' }
      }
    },
    {
      accessorKey: 'slowSlots',
      header: 'Slow',
      cell: ({ getValue }) => {
        const v = getValue<number>();
        return v === 0 ? (
          <span className="opacity-50">{v}</span>
        ) : (
          v.toLocaleString()
        );
      },
      meta: {
        cellProps: { className: 'text-warning fw-semibold' }
      }
    },
    {
      accessorKey: 'skippedSlots',
      header: 'Skipped',
      cell: ({ getValue }) => {
        const v = getValue<number>();
        return v === 0 ? (
          <span className="opacity-50">{v}</span>
        ) : (
          v.toLocaleString()
        );
      },
      meta: {
        cellProps: { className: 'text-danger fw-semibold' }
      }
    }
  ];

  if (clusterData.length > 0) {
    metricColumns.push({
      accessorFn: row => {
        let idealCredits = clusterData.find(
          value => value.epoch === row.epoch
        )?.earnedCredits;
        if (idealCredits === undefined) {
          return 'NA';
        } else {
          return idealCredits - row.earnedCredits;
        }
      },
      header: 'Deductions',
      cell: ({ getValue }) => {
        const v = getValue<number | string>();
        if (typeof v !== 'number') return v;
        return v === 0 ? (
          <span className="opacity-50">{v}</span>
        ) : (
          v.toLocaleString()
        );
      },
      meta: {
        cellProps: { className: 'text-body' }
      }
    });
  }

  metricColumns.push({
    accessorKey: 'totalExcessLatency',
    header: 'Lag',
    cell: ({ getValue }) => {
      const v = getValue<number>();
      return v === 0 ? (
        <span className="opacity-50">{v}</span>
      ) : (
        v.toLocaleString()
      );
    },
    meta: {
      cellProps: { className: 'text-body' }
    }
  });

  return [...columns, ...metricColumns];
};

const EpochVoteStatsTable = () => {
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

// Loading-state twin: matches the column layout above so the page can
// reveal progressively (header chrome + pulsing skeleton bars in the
// body) instead of swapping in a centered spinner.
const SKELETON_COLS: {
  header: string;
  width: number;
  borderStart?: boolean;
}[] = [
  { header: 'Epoch', width: 36 },
  { header: 'Rank', width: 36 },
  { header: 'Perfect', width: 50, borderStart: true },
  { header: 'Ok', width: 50 },
  { header: 'Slow', width: 50 },
  { header: 'Skipped', width: 50 },
  { header: 'Deductions', width: 60 },
  { header: 'Lag', width: 60 }
];

const skeletonBar = (width: number) => (
  <span className="placeholder-glow d-inline-block">
    <span
      className="placeholder rounded bg-primary-subtle"
      style={{ width, height: 10 }}
    />
  </span>
);

interface EpochVoteStatsTableSkeletonProps {
  rowCount?: number;
}

export const EpochVoteStatsTableSkeleton = ({
  rowCount = 6
}: EpochVoteStatsTableSkeletonProps) => {
  return (
    <div className="scrollbar ms-n1 ps-1">
      <Table className="data-table fs-9 table-striped table-with-padding">
        <thead>
          <tr>
            {SKELETON_COLS.map(col => (
              <th
                key={col.header}
                className={col.borderStart ? 'border-start' : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }).map((_, rowIdx) => (
            <tr key={rowIdx}>
              {SKELETON_COLS.map(col => (
                <td
                  key={col.header}
                  className={col.borderStart ? 'border-start' : undefined}
                >
                  {skeletonBar(col.width)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};

export default EpochVoteStatsTable;
