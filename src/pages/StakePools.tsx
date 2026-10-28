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
  bpsPct,
  poolPath,
  signedCount,
  signedSol
} from 'components/pools/pools';
import useAdvanceTable from 'hooks/useAdvanceTable';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import { FEATURES_KEY, VortexDataContext } from 'providers/VortexDataProvider';
import { PoolSummary } from 'providers/vortex-schemas';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Form } from 'react-bootstrap';
import { Link } from 'react-router';

/** Pools delegating to fewer validators than this are hidden unless
 *  asked for. */
const MIN_VALIDATORS = 10;

const NOWRAP = {
  headerProps: { className: 'text-nowrap' },
  cellProps: { className: 'text-nowrap' }
};
// Columns that give way on phones, where the table would scroll sideways.
const WIDE_ONLY = {
  headerProps: { className: 'text-nowrap d-none d-md-table-cell' },
  cellProps: { className: 'text-nowrap d-none d-md-table-cell' }
};
const END_WIDE_ONLY = {
  headerProps: { className: 'text-nowrap text-end d-none d-md-table-cell' },
  cellProps: {
    className: 'text-nowrap text-end font-monospace d-none d-md-table-cell'
  }
};
const END = {
  headerProps: { className: 'text-nowrap text-end' },
  cellProps: { className: 'text-nowrap text-end font-monospace' }
};

const columns = (
  showMedian: boolean,
  showFees: boolean,
  showMax: boolean
): ColumnDef<PoolSummary>[] => [
  {
    id: 'name',
    header: 'Staker',
    accessorFn: p => `${p.name} ${p.fullName ?? ''} ${p.authorities.join(' ')}`,
    cell: ({ row: { original: p } }) => (
      <span className="d-flex align-items-center gap-2">
        <Link
          to={poolPath(p.name)}
          className="fw-semibold"
          title={p.fullName ?? undefined}
        >
          {p.name}
        </Link>
        {p.fullName && (
          <span
            className="text-body-tertiary text-truncate d-none d-md-inline"
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
    cell: ({ row: { original: p } }) => (
      <KindBadge kind={p.kind} name={p.name} />
    ),
    meta: WIDE_ONLY
  },
  {
    id: 'stake',
    header: 'Stake',
    accessorFn: p => p.stake,
    cell: ({ row: { original: p } }) => (
      <>
        {compactSol(p.stake)}
        <Delta now={p.stake} prev={p.stakePrev} format={signedSol} below />
      </>
    ),
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
          below
        />
      </>
    ),
    meta: END
  },
  ...(showFees
    ? [
        {
          id: 'fee',
          header: 'Fee',
          accessorFn: (p: PoolSummary) => p.fees?.epochFeeBps ?? -1,
          cell: ({
            row: { original: p }
          }: {
            row: { original: PoolSummary };
          }) => {
            const f = p.fees;
            if (f?.epochFeeBps == null)
              return <span className="text-body-quaternary">—</span>;
            const next = f.nextEpochFeeBps;
            const changes = next != null && next !== f.epochFeeBps;
            return (
              <span
                title={
                  changes
                    ? `${bpsPct(next)} from the next epoch`
                    : 'Its commission on staking rewards'
                }
              >
                {bpsPct(f.epochFeeBps)}
                {changes && (
                  <span
                    className={`fs-10 d-block lh-1 ${next! > f.epochFeeBps! ? 'text-danger' : 'text-success'}`}
                  >
                    → {bpsPct(next)}
                  </span>
                )}
              </span>
            );
          },
          meta: END
        } as ColumnDef<PoolSummary>
      ]
    : []),
  ...(showMedian
    ? [
        {
          id: 'median',
          header: 'Median delegation',
          accessorFn: (p: PoolSummary) => p.medianStake ?? 0,
          cell: ({
            row: { original: p }
          }: {
            row: { original: PoolSummary };
          }) => (p.medianStake != null ? compactSol(p.medianStake) : '—'),
          meta: END_WIDE_ONLY
        } as ColumnDef<PoolSummary>
      ]
    : []),
  ...(showMax
    ? [
        {
          id: 'max',
          header: 'Max delegation',
          accessorFn: (p: PoolSummary) => p.maxStake ?? 0,
          cell: ({
            row: { original: p }
          }: {
            row: { original: PoolSummary };
          }) =>
            p.maxStake != null ? (
              <span
                title={
                  p.maxName || p.maxVoteKey
                    ? `On ${p.maxName ?? p.maxVoteKey}`
                    : undefined
                }
              >
                {compactSol(p.maxStake)}
              </span>
            ) : (
              '—'
            ),
          meta: END_WIDE_ONLY
        } as ColumnDef<PoolSummary>
      ]
    : [])
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
  // Small pools (fewer than MIN_VALIDATORS delegations) hidden by default.
  const [hideSmall, setHideSmall] = useState(true);
  const allPools = useMemo(() => data?.pools ?? [], [data]);
  const pools = useMemo(
    () =>
      hideSmall
        ? allPools.filter(p => p.validators >= MIN_VALIDATORS)
        : allPools,
    [allPools, hideSmall]
  );
  const hidden = allPools.length - pools.length;
  // Shown once the API gives each pool's median delegation.
  const showMedian = allPools.some(p => p.medianStake != null);
  // And once it gives their fees.
  const showFees = allPools.some(p => p.fees != null);
  // And its largest single delegation.
  const showMax = allPools.some(p => p.maxStake != null);
  // Totals and shares are over every pool, shown or not.
  const total = useMemo(
    () => allPools.reduce((a, p) => a + p.stake, 0),
    [allPools]
  );
  const table = useAdvanceTable({
    columns: useMemo(
      () => columns(showMedian, showFees, showMax),
      [showMedian, showFees, showMax]
    ),
    data: pools,
    sortable: true,
    pagination: true,
    pageSize: 25,
    getRowId: p => p.name,
    resetPageKey: String(hideSmall),
    initialState: { sorting: [{ id: 'stake', desc: true }] }
  });
  const stakeOf = (kind: string) =>
    allPools.filter(p => p.kind === kind).reduce((a, p) => a + p.stake, 0);
  const prevTotal = allPools.every(p => p.stakePrev != null)
    ? allPools.reduce((a, p) => a + (p.stakePrev ?? 0), 0)
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
                value={allPools
                  .filter(p => p.kind === 'stake-pool')
                  .length.toLocaleString()}
                sublabel={`${compactSol(stakeOf('stake-pool'))} delegated`}
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="SFDP"
                value={compactSol(stakeOf('sfdp'))}
                sublabel={`${(allPools.find(p => p.kind === 'sfdp')?.validators ?? 0).toLocaleString()} validators`}
                linkTo={
                  allPools.find(p => p.kind === 'sfdp')
                    ? poolPath(allPools.find(p => p.kind === 'sfdp')!.name)
                    : undefined
                }
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="Marinade"
                value={compactSol(stakeOf('marinade'))}
                sublabel={`${(allPools.find(p => p.kind === 'marinade')?.validators ?? 0).toLocaleString()} validators`}
                linkTo={
                  allPools.find(p => p.kind === 'marinade')
                    ? poolPath(allPools.find(p => p.kind === 'marinade')!.name)
                    : undefined
                }
              />
            </div>
          </div>

          <SectionCard
            title="All Stakers"
            icon="layers"
            info="Every known stake pool (Sanctum's LST list), Marinade (its two authorities as one) and SFDP (by its stake authority), with the effective stake each holds at the end of the epoch, on how many validators, and the change since the epoch before. Validators count holdings over 50 SOL: a pool's minimum stake on a validator (50 SOL or less) isn't a delegation. Median delegation: the middle of its holdings per validator, over those delegations. Max delegation: its largest holding on one validator (named on hover). Fee: its commission on staking rewards, from its on-chain account (an arrow when it changes next epoch). From Jito's per-epoch stake-meta file, published hours after an epoch ends."
          >
            <AdvanceTableProvider {...table}>
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                <SearchBox
                  placeholder="Search pools, names, authorities"
                  onChange={e =>
                    table.setGlobalFilter(e.target.value || undefined)
                  }
                />
                <div className="d-flex flex-wrap align-items-center gap-3">
                  <Form.Check
                    type="switch"
                    id="pools-hide-small"
                    className="fs-9 mb-0"
                    checked={hideSmall}
                    onChange={e => setHideSmall(e.target.checked)}
                    label={`Hide pools with fewer than ${MIN_VALIDATORS} validators${hideSmall && hidden ? ` (${hidden})` : ''}`}
                  />
                </div>
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
