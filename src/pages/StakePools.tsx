import { ColumnDef } from '@tanstack/react-table';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import DelayedSpinner from 'components/common/DelayedSpinner';
import SearchBox from 'components/common/SearchBox';
import SectionCard from 'components/common/SectionCard';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import {
  Delta,
  KIND,
  KindBadge,
  compactSol,
  pct,
  signedCount,
  signedSol
} from 'components/pools/pools';
import useAdvanceTable from 'hooks/useAdvanceTable';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import { FEATURES_KEY, VortexDataContext } from 'providers/VortexDataProvider';
import { PoolSummary } from 'providers/vortex-schemas';
import { useContext, useEffect, useMemo, useState } from 'react';
import { ButtonGroup, ToggleButton } from 'react-bootstrap';
import { Link } from 'react-router';

export const poolPath = (name: string) => `/pool/${encodeURIComponent(name)}`;

const FILTERS = [
  ['all', 'All'],
  ['stake-pool', 'Stake pools'],
  ['marinade', 'Marinade'],
  ['sfdp', 'SFDP']
] as const;
type Filter = (typeof FILTERS)[number][0];

const NOWRAP = {
  headerProps: { className: 'text-nowrap' },
  cellProps: { className: 'text-nowrap' }
};
const END = {
  headerProps: { className: 'text-nowrap text-end' },
  cellProps: { className: 'text-nowrap text-end font-monospace' }
};

const columns = (total: number): ColumnDef<PoolSummary>[] => [
  {
    id: 'name',
    header: 'Staker',
    accessorFn: p => `${p.name} ${p.fullName ?? ''} ${p.authorities.join(' ')}`,
    cell: ({ row: { original: p } }) => (
      <span className="d-flex align-items-center gap-2">
        <Link to={poolPath(p.name)} className="fw-semibold">
          {p.name}
        </Link>
        {p.fullName && (
          <span
            className="text-body-tertiary text-truncate"
            style={{ maxWidth: '16rem' }}
            title={p.fullName}
          >
            {p.fullName}
          </span>
        )}
      </span>
    ),
    meta: NOWRAP
  },
  {
    id: 'kind',
    header: 'Kind',
    accessorFn: p => p.kind ?? '',
    cell: ({ row: { original: p } }) => <KindBadge kind={p.kind} />,
    meta: NOWRAP
  },
  {
    id: 'stake',
    header: 'Stake',
    accessorFn: p => p.stake,
    cell: ({ row: { original: p } }) => (
      <>
        {compactSol(p.stake)}
        <Delta now={p.stake} prev={p.stakePrev} format={signedSol} />
      </>
    ),
    meta: END
  },
  {
    id: 'share',
    header: 'Of pooled stake',
    accessorFn: p => (total ? p.stake / total : 0),
    cell: ({ row: { original: p } }) => pct(total ? p.stake / total : null),
    meta: END
  },
  {
    id: 'validators',
    header: 'Validators',
    accessorFn: p => p.validators,
    cell: ({ row: { original: p } }) => (
      <>
        {p.validators.toLocaleString()}
        <Delta
          now={p.validators}
          prev={p.validatorsPrev}
          format={signedCount}
        />
      </>
    ),
    meta: END
  }
];

/**
 * Stake pools, Marinade and the Solana Foundation Delegation Program: how
 * much each delegates and to how many validators, as of the latest
 * completed epoch, with the change since the one before. Each links to
 * who it stakes to.
 */
const StakePools = () => {
  const context = useContext(VortexDataContext);
  const slice = context?.poolsState;
  const fetchData = slice?.fetchData;
  const data = slice?.data.get(FEATURES_KEY);
  useEffect(() => {
    fetchData?.(FEATURES_KEY);
  }, [fetchData]);
  const [filter, setFilter] = useState<Filter>('all');
  const pools = useMemo(() => data?.pools ?? [], [data]);
  const total = useMemo(() => pools.reduce((a, p) => a + p.stake, 0), [pools]);
  const shown = useMemo(
    () => (filter === 'all' ? pools : pools.filter(p => p.kind === filter)),
    [pools, filter]
  );
  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: pools.length,
      'stake-pool': 0,
      marinade: 0,
      sfdp: 0
    };
    for (const p of pools) if (p.kind && p.kind in c) c[p.kind as Filter]++;
    return c;
  }, [pools]);
  const table = useAdvanceTable({
    columns: useMemo(() => columns(total), [total]),
    data: shown,
    sortable: true,
    pagination: true,
    pageSize: 25,
    getRowId: p => p.name,
    resetPageKey: filter,
    initialState: { sorting: [{ id: 'stake', desc: true }] }
  });
  const stakeOf = (kind: string) =>
    pools.filter(p => p.kind === kind).reduce((a, p) => a + p.stake, 0);
  const prevTotal = pools.every(p => p.stakePrev != null)
    ? pools.reduce((a, p) => a + (p.stakePrev ?? 0), 0)
    : null;

  return (
    <div className="mb-9">
      <div className="page-header row g-3 align-items-start justify-content-between">
        <div className="col-auto">
          <h3>Stake Pools</h3>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">
            Who stake pools, Marinade and the Solana Foundation delegate to
            {data?.epoch != null && ` · epoch ${data.epoch.toLocaleString()}`}
          </p>
        </div>
      </div>

      {!data ? (
        slice?.error ? (
          <UntrackedState>
            Stake pools aren&apos;t available from this API yet.
          </UntrackedState>
        ) : (
          <DelayedSpinner loading label="Loading stake pools…" />
        )
      ) : (
        <div className="d-flex flex-column gap-3">
          <div className="row g-3">
            <div className="col-6 col-lg-3">
              <StatCard
                label="Pooled Stake"
                value={compactSol(total)}
                sublabel={
                  prevTotal != null
                    ? `${signedSol(total - prevTotal) ?? 'no change'} since epoch ${
                        data.epoch != null
                          ? (data.epoch - 1).toLocaleString()
                          : '—'
                      }`
                    : 'stake pools, Marinade and SFDP'
                }
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="Stake Pools"
                value={counts['stake-pool'].toLocaleString()}
                sublabel={`${compactSol(stakeOf('stake-pool'))} delegated`}
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="SFDP"
                value={compactSol(stakeOf('sfdp'))}
                sublabel={`${(pools.find(p => p.kind === 'sfdp')?.validators ?? 0).toLocaleString()} validators`}
                linkTo={
                  pools.find(p => p.kind === 'sfdp')
                    ? poolPath(pools.find(p => p.kind === 'sfdp')!.name)
                    : undefined
                }
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="Marinade"
                value={compactSol(stakeOf('marinade'))}
                sublabel={`${(pools.find(p => p.kind === 'marinade')?.validators ?? 0).toLocaleString()} validators`}
                linkTo={
                  pools.find(p => p.kind === 'marinade')
                    ? poolPath(pools.find(p => p.kind === 'marinade')!.name)
                    : undefined
                }
              />
            </div>
          </div>

          <SectionCard
            title="All Stakers"
            icon="layers"
            info="Every known stake pool (Sanctum's LST list), Marinade (its two authorities as one) and SFDP (by its stake authority), with the effective stake each holds at the end of the epoch, on how many validators, and the change since the epoch before. From Jito's per-epoch stake-meta file, published hours after an epoch ends."
          >
            <AdvanceTableProvider {...table}>
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                <SearchBox
                  placeholder="Search pools, names, authorities"
                  onChange={e =>
                    table.setGlobalFilter(e.target.value || undefined)
                  }
                />
                <ButtonGroup size="sm">
                  {FILTERS.map(([k, label]) => (
                    <ToggleButton
                      key={k}
                      id={`pools-filter-${k}`}
                      type="radio"
                      name="pools-filter"
                      variant="soft-secondary"
                      value={k}
                      checked={filter === k}
                      onChange={() => setFilter(k)}
                    >
                      {label}{' '}
                      <span className="text-body-tertiary fw-normal">
                        {counts[k].toLocaleString()}
                      </span>
                    </ToggleButton>
                  ))}
                </ButtonGroup>
              </div>
              <AdvanceTable
                tableProps={{ size: 'sm', className: 'data-table fs-9 mb-0' }}
              />
              <AdvanceTableFooter viewAll={false} />
            </AdvanceTableProvider>
            <p className="fs-10 text-body-tertiary mt-2 mb-0">
              {Object.values(KIND)
                .map(k => k.label)
                .join(', ')}{' '}
              only: other stakers (individuals, funds, custodians) aren&apos;t
              labeled.
            </p>
          </SectionCard>
        </div>
      )}
    </div>
  );
};

export default StakePools;
