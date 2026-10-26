import { ColumnDef } from '@tanstack/react-table';
import AdvanceTable from 'components/base/AdvanceTable';
import { latencyToCredits } from 'helpers/utils';
import { Link } from 'react-router';
import { Table } from 'react-bootstrap';

export const TOTALS_ROW_ID = 'TOTALS';

const categorizeLatencies = (
  latencies: number[],
  ideal: number[] | undefined
) => {
  let min = 0;
  let fast = 0;
  let slow = 0;
  let missed = 0;
  if (!ideal) return { min, fast, slow, missed };
  const len = Math.min(latencies.length, ideal.length);
  for (let i = 0; i < len; i++) {
    const v = latencies[i];
    const o = ideal[i];
    if (v === 0) {
      if (o !== 0) missed++;
      continue;
    }
    const delta = v - o;
    if (delta <= 0) min++;
    else if (delta === 1) fast++;
    else slow++;
  }
  return { min, fast, slow, missed };
};

const countVotable = (ideal: number[] | undefined) => {
  if (!ideal) return 0;
  let count = 0;
  for (let i = 0; i < ideal.length; i++) {
    if (ideal[i] !== 0) count++;
  }
  return count;
};

// Per-validator-per-bucket metrics. Pulled out so we can produce
// "alongside B" columns that read from the comparison validator's
// chunked latencies (`bLatencies`) instead of the row's own data.
type MetricRow = {
  key: 'perfect' | 'fast' | 'slow' | 'missed' | 'deductions' | 'lag';
  header: string;
  cellClass: string;
  /** Unit suffix shown next to the totals row (single mode) or in the
   *  comparison-mode group header. Omitted for Perfect (which is a %). */
  unit?: string;
  // Compute the metric value for one bucket from a validator's chunk +
  // the corresponding ideal chunk. Returns null when there is no data
  // for this bucket (e.g., the B validator hasn't reached this bucket).
  compute: (
    latencies: number[] | undefined,
    ideal: number[] | undefined
  ) => number | null;
  // Render the cell — receives the precomputed value, a flag for the
  // pinned totals row (which normally gets a units suffix), and whether
  // units should be inlined (false in comparison mode where units sit
  // in the group header instead).
  render: (
    value: number | null,
    isTotalsRow: boolean,
    showUnits: boolean
  ) => React.ReactNode;
};

const METRIC_ROWS: MetricRow[] = [
  {
    key: 'perfect',
    header: 'Perfect',
    cellClass: 'text-success fw-semibold text-center',
    compute: (latencies, ideal) => {
      if (!latencies || !ideal) return null;
      const votable = countVotable(ideal);
      if (votable === 0) return null;
      const { min } = categorizeLatencies(latencies, ideal);
      return min / votable;
    },
    render: value => {
      if (value === null) return <span className="opacity-50">—</span>;
      const display = `${(value * 100).toFixed(2)}%`;
      if (value === 0) return <span className="opacity-50">{display}</span>;
      return display;
    }
  },
  {
    key: 'fast',
    header: 'Ok',
    cellClass: 'text-primary-emphasis fw-semibold text-center',
    unit: 'votes',
    compute: (latencies, ideal) =>
      latencies ? categorizeLatencies(latencies, ideal).fast : null,
    render: (v, isTotals, showUnits) => {
      if (v === null) return <span className="opacity-50">—</span>;
      if (isTotals && showUnits)
        return (
          <>
            {v.toLocaleString()} <span className="text-body">votes</span>
          </>
        );
      if (isTotals) return v.toLocaleString();
      return v === 0 ? <span className="opacity-50">{v}</span> : v;
    }
  },
  {
    key: 'slow',
    header: 'Slow',
    cellClass: 'text-warning fw-semibold text-center',
    unit: 'votes',
    compute: (latencies, ideal) =>
      latencies ? categorizeLatencies(latencies, ideal).slow : null,
    render: (v, isTotals, showUnits) => {
      if (v === null) return <span className="opacity-50">—</span>;
      if (isTotals && showUnits)
        return (
          <>
            {v.toLocaleString()} <span className="text-body">votes</span>
          </>
        );
      if (isTotals) return v.toLocaleString();
      return v === 0 ? <span className="opacity-50">{v}</span> : v;
    }
  },
  {
    key: 'missed',
    header: 'Skipped',
    cellClass: 'text-danger fw-semibold text-center',
    unit: 'votes',
    compute: (latencies, ideal) =>
      latencies ? categorizeLatencies(latencies, ideal).missed : null,
    render: (v, isTotals, showUnits) => {
      if (v === null) return <span className="opacity-50">—</span>;
      if (isTotals && showUnits)
        return (
          <>
            {v.toLocaleString()} <span className="text-body">votes</span>
          </>
        );
      if (isTotals) return v.toLocaleString();
      return v === 0 ? <span className="opacity-50">{v}</span> : v;
    }
  },
  {
    key: 'deductions',
    header: 'Deductions',
    cellClass: 'text-body',
    unit: 'credits',
    compute: (latencies, ideal) => {
      if (!latencies || !ideal || ideal.length === 0) return null;
      // Sum earned + optimal over the SAME slot window. The two records
      // are fetched independently over a forever-cache, so on a live
      // epoch one can be a few slots ahead of the other within the
      // current partial bucket. Clipping only `ideal` (its old behavior)
      // let `earned` cover more slots than `optimal` when the validator
      // record was the longer one — producing a spurious negative
      // deduction. Align both to the common length.
      const len = Math.min(latencies.length, ideal.length);
      let earned = 0;
      let optimal = 0;
      for (let i = 0; i < len; i++) {
        earned += latencyToCredits(latencies[i]);
        optimal += latencyToCredits(ideal[i]);
      }
      return optimal - earned;
    },
    render: (v, isTotals, showUnits) => {
      if (v === null) return <span className="opacity-50">—</span>;
      if (isTotals && showUnits)
        return (
          <>
            {v.toLocaleString()}{' '}
            <span className="text-body-tertiary">credits</span>
          </>
        );
      if (isTotals) return v.toLocaleString();
      return v;
    }
  },
  {
    key: 'lag',
    header: 'Lag',
    cellClass: 'text-body',
    unit: 'slots',
    compute: (latencies, ideal) => {
      if (!latencies || !ideal) return null;
      // Bound the loop by the shorter of the two records — see the
      // Deductions note above. Reading `ideal[i]` past its end (when a
      // stale-shorter ideal is paired with a fresh-longer validator
      // record) yielded `NaN` here; clipping to the common length keeps
      // every term well-defined.
      const len = Math.min(latencies.length, ideal.length);
      let excess = 0;
      for (let i = 0; i < len; i++) {
        if (latencies[i] === 0) continue;
        excess += latencies[i] - ideal[i];
      }
      return excess;
    },
    render: (v, isTotals, showUnits) => {
      if (v === null) return <span className="opacity-50">—</span>;
      if (isTotals && showUnits)
        return (
          <>
            {v.toLocaleString()}{' '}
            <span className="text-body-tertiary">slots</span>
          </>
        );
      if (isTotals) return v.toLocaleString();
      return v;
    }
  }
];

export const createEpochVoteRecordTableColumns = (
  voteAddress: string,
  epoch: number | undefined,
  epochStartSlot: number | undefined,
  chunkSize: number,
  idealLatencies: number[][] | undefined,
  // Comparison validator's chunked latencies, parallel to row index.
  // When provided, each metric column is paired with a B column.
  bLatencies?: number[][]
): ColumnDef<number[]>[] => {
  const cmpMode = bLatencies !== undefined;

  // Build the A-column for one metric (reads from the row's own latencies).
  // In comparison mode the header is just "A" because the parent group
  // header carries the metric name; in single mode it's the full label.
  // In comparison mode the A cell also opens its group with a left border.
  const aColumn = (metric: MetricRow): ColumnDef<number[]> => {
    const centered = metric.cellClass.includes('text-center');
    const borderClass = cmpMode ? 'border-start border-translucent' : '';
    return {
      id: `${metric.key}A`,
      sortingFn: 'basic',
      accessorFn: (latencies, index) =>
        metric.compute(latencies, idealLatencies?.at(index)) ?? 0,
      cell: ({ row }) => {
        const value = metric.compute(
          row.original,
          idealLatencies?.at(row.index)
        );
        return metric.render(value, row.index === 0, !cmpMode);
      },
      header: cmpMode ? 'A' : metric.header,
      meta: {
        cellProps: {
          className: `${metric.cellClass} ${borderClass}`.trim()
        },
        headerProps: {
          className: `${centered ? 'text-center' : ''} ${borderClass}`.trim()
        }
      }
    };
  };

  // Build the B-column for one metric (reads from bLatencies by row index).
  const bColumn = (metric: MetricRow): ColumnDef<number[]> => ({
    id: `${metric.key}B`,
    sortingFn: 'basic',
    accessorFn: (_latencies, index) =>
      metric.compute(bLatencies?.at(index), idealLatencies?.at(index)) ?? 0,
    cell: ({ row }) => {
      const value = metric.compute(
        bLatencies?.at(row.index),
        idealLatencies?.at(row.index)
      );
      return metric.render(value, row.index === 0, false);
    },
    header: 'B',
    meta: {
      cellProps: {
        className: `${metric.cellClass} bg-body-secondary bg-opacity-25`
      },
      headerProps: {
        className: `bg-body-secondary bg-opacity-25 ${metric.cellClass.includes('text-center') ? 'text-center' : ''}`
      }
    }
  });

  // In comparison mode wrap each (A, B) pair in a group column so the
  // metric name spans the two leaf headers; otherwise flat columns. The
  // group header is always centered above its A/B pair, regardless of
  // how the individual metric cells align.
  const metricCols: ColumnDef<number[]>[] = cmpMode
    ? METRIC_ROWS.map(m => ({
        id: `${m.key}-group`,
        // Units move from the totals row into the group header in
        // comparison mode (e.g. "Ok (votes)") to save row width.
        header: m.unit ? `${m.header} (${m.unit})` : m.header,
        meta: {
          headerProps: {
            className: 'text-center border-start border-translucent'
          }
        },
        columns: [aColumn(m), bColumn(m)]
      }))
    : METRIC_ROWS.map(m => aColumn(m));

  return [
    {
      id: 'bucket',
      accessorFn: (_latencies, index) => index,
      cell: ({ row }) => {
        if (row.index === 0) {
          return <span className="fw-semibold">Total</span>;
        }
        return row.index;
      },
      header: 'Bucket',
      meta: {
        cellProps: { className: 'text-body fw-semibold' }
      }
    },
    {
      id: 'slot-range',
      cell: ({ row }) => {
        if (epochStartSlot === undefined || epoch === undefined) return;
        if (row.index === 0) {
          return 'All slots';
        }
        const bucketIndex = row.index - 1;
        const slotRange = `${
          (epochStartSlot + bucketIndex * chunkSize) / chunkSize
        }000..999`;
        return (
          <Link
            to={`/validator/${voteAddress}/votes/epoch/${epoch}/bucket/${
              bucketIndex + 1
            }`}
          >
            {slotRange}
          </Link>
        );
      },
      header: 'Slot Range',
      enableSorting: false,
      meta: {
        cellProps: { className: 'text-body' }
      }
    },
    ...metricCols
  ];
};

const EpochVoteRecordTable = () => {
  return (
    <div>
      <AdvanceTable
        tableProps={{
          className: 'data-table fs-9 table-striped table-with-padding'
        }}
      />
    </div>
  );
};

// Loading-state twin of EpochVoteRecordTable. Renders the same chrome
// (column headers + table classes) with pulsing skeleton bars in the
// body so the page can reveal progressively instead of swapping in a
// centered spinner. Header / cell alignment intentionally mirrors
// `createEpochVoteRecordTableColumns` above.
const SKELETON_COLS: {
  header: string;
  width: number;
  headerClass?: string;
  cellClass?: string;
}[] = [
  { header: 'Bucket', width: 24 },
  { header: 'Slot Range', width: 80 },
  {
    header: 'Perfect',
    width: 70,
    headerClass: 'text-center',
    cellClass: 'text-center'
  },
  {
    header: 'Ok',
    width: 50,
    headerClass: 'text-center',
    cellClass: 'text-center'
  },
  {
    header: 'Slow',
    width: 50,
    headerClass: 'text-center',
    cellClass: 'text-center'
  },
  {
    header: 'Skipped',
    width: 50,
    headerClass: 'text-center',
    cellClass: 'text-center'
  },
  { header: 'Deductions', width: 70 },
  { header: 'Lag', width: 50 }
];

const skeletonBar = (width: number) => (
  <span className="placeholder-glow d-inline-block">
    <span
      className="placeholder rounded bg-primary-subtle"
      style={{ width, height: 10 }}
    />
  </span>
);

interface EpochVoteRecordTableSkeletonProps {
  rowCount?: number;
}

export const EpochVoteRecordTableSkeleton = ({
  rowCount = 4
}: EpochVoteRecordTableSkeletonProps) => {
  return (
    <div className="scrollbar ms-n1 ps-1">
      <Table className="data-table fs-9 table-striped table-with-padding">
        <thead>
          <tr>
            {SKELETON_COLS.map(col => (
              <th key={col.header} className={col.headerClass}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }).map((_, rowIdx) => (
            <tr key={rowIdx}>
              {SKELETON_COLS.map(col => (
                <td key={col.header} className={col.cellClass}>
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

export default EpochVoteRecordTable;
