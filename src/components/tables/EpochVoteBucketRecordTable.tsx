import { ColumnDef } from '@tanstack/react-table';
import FeatherIcon from 'feather-icons-react';
import AdvanceTable from 'components/base/AdvanceTable';
import Badge, { BadgeBg } from 'components/base/Badge';
import { latencyToCredits } from 'helpers/utils';
import { BlockInsight, Validator } from 'providers/VortexDataProvider';

export const TOTALS_ROW_ID = 'TOTALS';

export type SlotFilter =
  | 'all'
  | 'investigate'
  | 'investigate-neighbors'
  | 'lag-only'
  | 'deductions-only'
  | 'skipped-only';

export type SlotStatus = 'Perfect' | 'Ok' | 'Slow' | 'Skipped' | 'None';

// Discriminated row union for the bucket table. `ellipsis` separates
// non-contiguous chunks in Investigate mode (sortKey keeps it pinned
// between its neighbours under either sort direction). `skeleton` is
// the placeholder used while voter / ideal data is in flight, so the
// page can render the table chrome with pulsing rows in the body.
export type BucketRow =
  | { kind: 'totals' }
  | { kind: 'slot'; latency: number; slotIndex: number }
  | { kind: 'ellipsis'; sortKey: number }
  | { kind: 'skeleton'; index: number };

export const slotStatus = (
  latency: number,
  ideal: number | undefined
): SlotStatus => {
  if (ideal === undefined || ideal === 0) return 'None';
  if (latency === 0) return 'Skipped';
  const delta = latency - ideal;
  if (delta <= 0) return 'Perfect';
  if (delta === 1) return 'Ok';
  return 'Slow';
};

const STATUS_BG: Record<SlotStatus, BadgeBg | undefined> = {
  Perfect: 'success',
  Ok: 'primary',
  Slow: 'warning',
  Skipped: 'danger',
  None: 'secondary'
};

// Latency bucket → color, aligned with the Perfect / Ok / Slow palette
// used by the status pills. Latency 1 = success, 2 = primary (the
// theme's blue), 3-16 = warning, 17-30 = danger-light, 31 = danger,
// 0 = secondary-bg (did not vote).
const latencyColor = (latency: number): string => {
  if (latency === 0) return 'var(--vx-secondary-bg)';
  if (latency === 1) return 'var(--vx-success)';
  if (latency === 2) return 'var(--vx-primary-text-emphasis)';
  if (latency <= 16) return 'var(--vx-warning)';
  if (latency <= 30) return 'var(--vx-danger-light, var(--vx-danger))';
  return 'var(--vx-danger)';
};

type Totals = {
  sumLatency: number;
  sumIdeal: number;
  sumEarned: number;
  sumOptimal: number;
  sumMissed: number;
};

const computeTotals = (
  voter: number[] | undefined,
  ideal: number[] | undefined
): Totals | null => {
  if (!voter || !ideal) return null;
  const len = Math.min(voter.length, ideal.length);
  let sumLatency = 0;
  let sumIdeal = 0;
  let sumEarned = 0;
  let sumOptimal = 0;
  let sumMissed = 0;
  for (let i = 0; i < len; i++) {
    const v = voter[i];
    const o = ideal[i];
    if (v > 0) sumLatency += v;
    if (o > 0) sumIdeal += o;
    const earned = latencyToCredits(v);
    const optimal = latencyToCredits(o);
    sumEarned += earned;
    sumOptimal += optimal;
    sumMissed += optimal - earned;
  }
  return { sumLatency, sumIdeal, sumEarned, sumOptimal, sumMissed };
};

const renderTotal = (v: number) => (
  <span className="fw-semibold">{v.toLocaleString()}</span>
);

const ellipsisCell = () => (
  <span className="text-body-tertiary fw-semibold">…</span>
);

// Adaptive percentage formatter for the Distribution chips. The cluster
// best is force-included even at tiny share; rounding to 0% via
// toFixed(0) would drop useful info ("L1 0%" reads as broken). Keep a
// digit on sub-1% values so the reader sees "L1 0.4%" instead.
const formatPct = (pct: number): string => {
  if (pct >= 1) return `${pct.toFixed(0)}%`;
  if (pct >= 0.1) return `${pct.toFixed(1)}%`;
  return '<0.1%';
};

// Pulsing skeleton rectangle used both for in-flight insight cells and
// for the page-level loading rows below the table chrome.
const skeletonBar = (width: number) => (
  <span className="placeholder-glow d-inline-block">
    <span
      className="placeholder rounded bg-primary-subtle"
      style={{ width, height: 10 }}
    />
  </span>
);

// Loading-state data builder: a fixed list of skeleton rows so the
// table renders its chrome (headers, row striping, alignment) with
// pulsing placeholders in the body while voter / ideal data is in
// flight.
export const buildSkeletonRows = (count = 10): BucketRow[] =>
  Array.from({ length: count }, (_, i) => ({
    kind: 'skeleton' as const,
    index: i
  }));

// Standard data builder: totals row + every slot in the bucket.
export const buildBucketRows = (voter: number[] | undefined): BucketRow[] => {
  if (!voter || voter.length === 0) return [];
  const rows: BucketRow[] = [{ kind: 'totals' }];
  for (let i = 0; i < voter.length; i++) {
    rows.push({ kind: 'slot', latency: voter[i], slotIndex: i });
  }
  return rows;
};

// Investigate-mode builder (plain): keep only Ok / Slow / Skipped slots
// — Perfect slots are uninteresting and None (cluster-skipped) slots
// aren't actionable from this validator's perspective. An ellipsis row
// is dropped between non-contiguous chunks so the reader can tell when
// runs of notable slots end and begin without scanning slot numbers.
export const buildInvestigateRows = (
  voter: number[] | undefined,
  ideal: number[] | undefined
): BucketRow[] => {
  if (!voter || !ideal || voter.length === 0) return [];
  const len = Math.min(voter.length, ideal.length);
  const rows: BucketRow[] = [{ kind: 'totals' }];
  let prev = -1;
  for (let i = 0; i < len; i++) {
    const status = slotStatus(voter[i], ideal[i]);
    if (status === 'Perfect' || status === 'None') continue;
    if (prev !== -1 && i > prev + 1) {
      rows.push({ kind: 'ellipsis', sortKey: (prev + i) / 2 });
    }
    rows.push({ kind: 'slot', latency: voter[i], slotIndex: i });
    prev = i;
  }
  return rows;
};

// Investigate-mode builder (with neighbors): keep every non-Perfect slot
// plus a 2-slot buffer on either side, separating non-contiguous ranges
// with an ellipsis row.
export const buildInvestigateWithNeighborsRows = (
  voter: number[] | undefined,
  ideal: number[] | undefined
): BucketRow[] => {
  if (!voter || !ideal || voter.length === 0) return [];
  const len = Math.min(voter.length, ideal.length);
  const visible = new Set<number>();
  for (let i = 0; i < len; i++) {
    if (slotStatus(voter[i], ideal[i]) === 'Perfect') continue;
    const lo = Math.max(0, i - 2);
    const hi = Math.min(len - 1, i + 2);
    for (let j = lo; j <= hi; j++) visible.add(j);
  }
  const sorted = Array.from(visible).sort((a, b) => a - b);
  const rows: BucketRow[] = [{ kind: 'totals' }];
  let prev = -1;
  for (const idx of sorted) {
    if (prev !== -1 && idx > prev + 1) {
      rows.push({ kind: 'ellipsis', sortKey: (prev + idx) / 2 });
    }
    rows.push({ kind: 'slot', latency: voter[idx], slotIndex: idx });
    prev = idx;
  }
  return rows;
};

interface FactoryOptions {
  // When true, the table grows the Latency Dist. / Leader slot / Leader
  // / Leader Region columns backed by the loaded BlockInsights.
  isInvestigate?: boolean;
  blockInsights?: Map<number, BlockInsight>;
  validatorsByNodeAddress?: Map<string, Validator>;
  // Leader-region lookup: nodeAddress -> continent, sourced from the
  // epoch's voting leaderboard records (the only place per-validator geo
  // lives). Feeds the "Leader Region" column. Undefined while the
  // leaderboard is still loading.
  leaderRegionByNodeAddress?: Map<string, string | null>;
  // Whether the insights slice currently has a fetch in flight; drives
  // per-cell loading skeletons on cells that depend on insight data.
  insightsLoading?: boolean;
}

export const createEpochVoteBucketRecordTableColumns = (
  bucket: number | undefined,
  epochStartSlot: number | undefined,
  voterLatencies: number[] | undefined,
  idealLatencies: number[] | undefined,
  options: FactoryOptions = {}
): ColumnDef<BucketRow>[] => {
  const {
    isInvestigate = false,
    blockInsights,
    validatorsByNodeAddress,
    leaderRegionByNodeAddress,
    insightsLoading = false
  } = options;
  const insightsPlaceholder = (width: number) =>
    insightsLoading ? (
      skeletonBar(width)
    ) : (
      <span className="text-body-tertiary">—</span>
    );
  const idealAt = (slotIndex: number) => idealLatencies?.at(slotIndex);
  const isNone = (row: BucketRow) => {
    if (row.kind !== 'slot') return false;
    const ideal = idealAt(row.slotIndex);
    return ideal === undefined || ideal === 0;
  };
  // Resolves an absolute slot number from a row's bucket-local slotIndex.
  const slotNumber = (slotIndex: number) =>
    epochStartSlot !== undefined && bucket !== undefined
      ? epochStartSlot + bucket * 1000 + slotIndex
      : undefined;
  const totals = computeTotals(voterLatencies, idealLatencies);

  const columns: ColumnDef<BucketRow>[] = [
    {
      id: 'slot',
      accessorFn: row => {
        if (row.kind === 'totals' || row.kind === 'skeleton') return undefined;
        if (epochStartSlot === undefined || bucket === undefined)
          return undefined;
        const slotIndex = row.kind === 'ellipsis' ? row.sortKey : row.slotIndex;
        return epochStartSlot + bucket * 1000 + slotIndex;
      },
      cell: ({ row, getValue }) => {
        if (row.original.kind === 'totals') {
          return <span className="fw-semibold">All slots</span>;
        }
        if (row.original.kind === 'ellipsis') return ellipsisCell();
        if (row.original.kind === 'skeleton') return skeletonBar(120);
        const v = getValue<number | undefined>();
        if (isNone(row.original)) {
          return <span className="text-body-quaternary">{v}</span>;
        }
        if (v === undefined) return v;
        return (
          <a
            href={`https://explorer.solana.com/block/${v}`}
            target="_blank"
            rel="noopener noreferrer"
            className="external-link"
          >
            {v}
            <FeatherIcon
              icon="arrow-up-right"
              size={14}
              className="external-link-icon ms-1"
            />
          </a>
        );
      },
      header: 'Slot',
      meta: {
        cellProps: { className: 'text-body' }
      }
    },
    {
      id: 'status',
      accessorFn: row => {
        if (row.kind !== 'slot') return 'None' as SlotStatus;
        return slotStatus(row.latency, idealAt(row.slotIndex));
      },
      filterFn: (row, columnId, filterValue) => {
        if (row.original.kind !== 'slot') return true;
        const status = row.getValue<SlotStatus>(columnId);
        if (filterValue === 'lag-only') {
          return status === 'Ok' || status === 'Slow' || status === 'Skipped';
        }
        if (filterValue === 'deductions-only') {
          if (status === 'Slow' || status === 'Skipped') return true;
          if (status === 'Ok') {
            // Ok = voter latency one over ideal. Credits only deduct when
            // ideal latency >= 2, since latencyToCredits is flat across
            // latencies 1 and 2 (both = 16 credits).
            const ideal = idealAt(row.original.slotIndex);
            return ideal !== undefined && ideal >= 2;
          }
          return false;
        }
        if (filterValue === 'skipped-only') return status === 'Skipped';
        return true;
      },
      cell: ({ row, getValue }) => {
        if (row.original.kind === 'ellipsis') return ellipsisCell();
        if (row.original.kind === 'skeleton') return skeletonBar(60);
        if (row.original.kind === 'totals') return null;
        const status = getValue<SlotStatus>();
        return (
          <Badge variant="soft" bg={STATUS_BG[status]}>
            {status}
          </Badge>
        );
      },
      header: 'Status'
    },
    {
      id: 'latency',
      accessorFn: row => {
        if (row.kind === 'totals') return totals?.sumLatency ?? 0;
        if (row.kind !== 'slot') return 0;
        return row.latency;
      },
      cell: ({ row, getValue }) => {
        if (row.original.kind === 'ellipsis') return ellipsisCell();
        if (row.original.kind === 'skeleton') return skeletonBar(60);
        const v = getValue<number>();
        if (row.original.kind === 'totals') {
          const ideal = totals?.sumIdeal ?? 0;
          return (
            <>
              <span className="fw-semibold">{v.toLocaleString()}</span>{' '}
              <span className="text-body-tertiary">
                ({ideal.toLocaleString()})
              </span>
            </>
          );
        }
        if (isNone(row.original)) return '-';
        const ideal = idealAt(row.original.slotIndex) ?? 0;
        const main = v === 0 ? '-' : v;
        return (
          <>
            {main} <span className="text-body-tertiary">({ideal})</span>
          </>
        );
      },
      header: 'Latency (ideal)',
      meta: {
        cellProps: { className: 'text-body' }
      }
    },
    {
      id: 'credits',
      accessorFn: row => {
        if (row.kind === 'totals') return totals?.sumEarned ?? 0;
        if (row.kind !== 'slot') return 0;
        return latencyToCredits(row.latency);
      },
      cell: ({ row, getValue }) => {
        if (row.original.kind === 'ellipsis') return ellipsisCell();
        if (row.original.kind === 'skeleton') return skeletonBar(70);
        const earned = getValue<number>();
        if (row.original.kind === 'totals') {
          const optimal = totals?.sumOptimal ?? 0;
          return (
            <>
              <span className="fw-semibold">{earned.toLocaleString()}</span>{' '}
              <span className="text-body-tertiary">
                / {optimal.toLocaleString()}
              </span>
            </>
          );
        }
        if (isNone(row.original)) return '-';
        const ideal = idealAt(row.original.slotIndex);
        const optimal = ideal !== undefined ? latencyToCredits(ideal) : 0;
        return (
          <>
            {earned} <span className="text-body-tertiary">/ {optimal}</span>
          </>
        );
      },
      header: 'Credits (optimal)',
      meta: {
        cellProps: { className: 'text-body' }
      }
    },
    {
      id: 'deductions',
      accessorFn: row => {
        if (row.kind === 'totals') return totals?.sumMissed ?? 0;
        if (row.kind !== 'slot') return 0;
        const ideal = idealAt(row.slotIndex);
        if (ideal === undefined) return 0;
        return latencyToCredits(ideal) - latencyToCredits(row.latency);
      },
      cell: ({ row, getValue }) => {
        if (row.original.kind === 'ellipsis') return ellipsisCell();
        if (row.original.kind === 'skeleton') return skeletonBar(40);
        const v = getValue<number>();
        if (row.original.kind === 'totals') {
          return (
            <>
              {renderTotal(v)}{' '}
              <span className="text-body-tertiary">credits</span>
            </>
          );
        }
        if (isNone(row.original)) return '-';
        return v;
      },
      header: 'Deductions',
      meta: {
        cellProps: { className: 'text-body' }
      }
    }
  ];

  if (isInvestigate) {
    columns.push({
      id: 'distribution',
      enableSorting: false,
      cell: ({ row }) => {
        if (row.original.kind === 'skeleton') {
          return <div style={{ minWidth: 160 }}>{skeletonBar(140)}</div>;
        }
        if (row.original.kind !== 'slot') return null;
        if (isNone(row.original)) {
          return <div style={{ minWidth: 160 }}>-</div>;
        }
        const slot = slotNumber(row.original.slotIndex);
        const insight =
          slot !== undefined ? blockInsights?.get(slot) : undefined;
        if (!insight?.distribution) {
          return (
            <div style={{ minWidth: 160 }}>{insightsPlaceholder(120)}</div>
          );
        }
        // Always include the cluster-best latency (lowest non-zero
        // bucket) even if it's a tiny share of stake — it answers
        // "what's the fastest anyone landed?" which is the whole point
        // of the column. Then greedy-pick top buckets by stake until
        // ~95% cumulative covered or we hit MAX_VISIBLE, skipping
        // anything below MIN_PCT to avoid 0%-rounding artefacts.
        const MIN_PCT = 0.5;
        const TARGET_PCT = 95;
        const MAX_VISIBLE = 3;
        const clusterBest = [...insight.distribution]
          .filter(e => e.latency > 0)
          .sort((a, b) => a.latency - b.latency)[0];
        const visibleSet: typeof insight.distribution = [];
        const visibleLatencies = new Set<number>();
        let cumulative = 0;
        if (clusterBest) {
          visibleSet.push(clusterBest);
          visibleLatencies.add(clusterBest.latency);
          cumulative += clusterBest.stakePct;
        }
        const byStakeDesc = [...insight.distribution]
          .filter(e => e.stakePct >= MIN_PCT)
          .sort((a, b) => b.stakePct - a.stakePct);
        for (const entry of byStakeDesc) {
          if (visibleLatencies.has(entry.latency)) continue;
          if (visibleSet.length >= MAX_VISIBLE) break;
          if (cumulative >= TARGET_PCT) break;
          visibleSet.push(entry);
          visibleLatencies.add(entry.latency);
          cumulative += entry.stakePct;
        }
        const visible = [...visibleSet].sort((a, b) => a.latency - b.latency);
        const hidden = insight.distribution.filter(
          e => !visibleLatencies.has(e.latency)
        );
        const hiddenStake = hidden.reduce((acc, e) => acc + e.stakePct, 0);
        const showHidden = hiddenStake >= MIN_PCT;
        return (
          <div
            className="d-flex flex-wrap align-items-center column-gap-2 row-gap-1 fs-10"
            style={{ minWidth: 160 }}
          >
            {visible.map(entry => (
              <span
                key={entry.latency}
                className="d-inline-flex align-items-center gap-1"
                title={`${entry.validatorCount.toLocaleString()} validators`}
              >
                <span
                  className="d-inline-block rounded-circle"
                  style={{
                    width: 8,
                    height: 8,
                    backgroundColor: latencyColor(entry.latency)
                  }}
                />
                <span>
                  {entry.latency === 0 ? 'MISS' : `L${entry.latency}`}{' '}
                  <span className="text-body fw-semibold">
                    {formatPct(entry.stakePct)}
                  </span>
                </span>
              </span>
            ))}
            {showHidden && (
              <span
                className="text-body-tertiary"
                title={hidden
                  .map(e => `L${e.latency}: ${e.stakePct.toFixed(2)}%`)
                  .join('\n')}
              >
                +{hidden.length} ({formatPct(hiddenStake)})
              </span>
            )}
          </div>
        );
      },
      header: 'Latency Dist.'
    });
  }

  if (isInvestigate) {
    columns.push({
      id: 'vote-excluded',
      enableSorting: false,
      cell: ({ row }) => {
        if (row.original.kind !== 'slot') return null;
        if (isNone(row.original)) return null;
        const slot = slotNumber(row.original.slotIndex);
        const insight =
          slot !== undefined ? blockInsights?.get(slot) : undefined;
        if (insight?.noVotes !== true) return null;
        return (
          <Badge
            variant="soft"
            bg="warning"
            title="Leader produced a confirmed block but excluded every vote transaction. Validators voted on this slot — their vote tx had to land in a later vote-inclusive slot, which inflates median latency for this row."
          >
            Vote-excluded
          </Badge>
        );
      },
      header: ''
    });
    columns.push({
      id: 'leader-slot',
      enableSorting: false,
      cell: ({ row }) => {
        if (row.original.kind === 'skeleton') return skeletonBar(36);
        if (row.original.kind !== 'slot') return null;
        if (isNone(row.original)) return '-';
        const slot = slotNumber(row.original.slotIndex);
        if (slot === undefined) return null;
        return (
          <span className="text-body">
            {(slot % 4) + 1}
            <span className="text-primary"> / 4</span>
          </span>
        );
      },
      header: 'Leader slot'
    });
    columns.push({
      id: 'leader',
      enableSorting: false,
      cell: ({ row }) => {
        if (row.original.kind === 'skeleton') {
          return <div style={{ minWidth: 140 }}>{skeletonBar(110)}</div>;
        }
        if (row.original.kind !== 'slot') return null;
        if (isNone(row.original)) {
          return <div style={{ minWidth: 140 }}>-</div>;
        }
        const slot = slotNumber(row.original.slotIndex);
        const insight =
          slot !== undefined ? blockInsights?.get(slot) : undefined;
        if (!insight?.leaderNodeAddress) {
          return (
            <div style={{ minWidth: 140 }}>{insightsPlaceholder(110)}</div>
          );
        }
        const leader = validatorsByNodeAddress?.get(insight.leaderNodeAddress);
        const name = leader?.name ?? insight.leaderNodeAddress;
        const truncated = name.length > 22 ? `${name.slice(0, 20)}…` : name;
        return (
          <div style={{ minWidth: 140 }}>
            <span
              className="text-body"
              title={leader?.name ?? insight.leaderNodeAddress}
            >
              {truncated}
            </span>
          </div>
        );
      },
      header: 'Leader'
    });
    columns.push({
      id: 'leader-region',
      enableSorting: false,
      cell: ({ row }) => {
        if (row.original.kind === 'skeleton') return skeletonBar(80);
        if (row.original.kind !== 'slot') return null;
        if (isNone(row.original)) return '-';
        const slot = slotNumber(row.original.slotIndex);
        const insight =
          slot !== undefined ? blockInsights?.get(slot) : undefined;
        if (!insight?.leaderNodeAddress) return insightsPlaceholder(80);
        // Leader geo is joined from the epoch's voting leaderboard
        // (continent), the only per-validator region source. A leader
        // that didn't rank as a voter — or a leaderboard still in
        // flight — falls back to the em dash, matching the leaderboard
        // table's `continent || '—'` convention.
        const region = leaderRegionByNodeAddress?.get(
          insight.leaderNodeAddress
        );
        return <span className="text-body">{region || '—'}</span>;
      },
      header: 'Leader Region'
    });
  }

  return columns;
};

const EpochVoteBucketRecordTable = () => {
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

export default EpochVoteBucketRecordTable;
