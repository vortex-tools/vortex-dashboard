import { choosersLine, poolDirectedBy, sumBy } from 'components/pools/directed';
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
  AdmissionBadge,
  KindBadge,
  kindOf,
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
// The staker column stays put while the table scrolls sideways on a phone.
// Opaque, and striped with its row (see .leaderboard-sticky-col).
const STICKY = {
  headerProps: { className: 'text-nowrap leaderboard-sticky-col start-0' },
  cellProps: { className: 'text-nowrap leaderboard-sticky-col start-0' }
};
const END = {
  headerProps: { className: 'text-nowrap text-end' },
  cellProps: { className: 'text-nowrap text-end font-monospace' }
};

/** "Hylo ◎173.4K" per line: a hover list of the validators added or
 *  dropped, with "and N more" past the ones listed. */
const refList = <R extends { name: string | null; voteKey: string }>(
  refs: R[] | null | undefined,
  stakeOf: (r: R) => number | null,
  more: number
) =>
  (refs ?? [])
    .map(r => {
      const stake = stakeOf(r);
      return `${r.name ?? `${r.voteKey.slice(0, 4)}…${r.voteKey.slice(-4)}`}${stake != null ? ` ${compactSol(stake)}` : ''}`;
    })
    .concat(more > 0 ? [`and ${more.toLocaleString()} more`] : [])
    .join('\n');

const columns = (
  showMedian: boolean,
  showFees: boolean,
  showMax: boolean,
  showDirected: boolean
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
    meta: STICKY
  },
  {
    id: 'kind',
    header: 'Kind',
    accessorFn: p => p.kind ?? '',
    cell: ({ row: { original: p } }) => (
      <KindBadge kind={p.kind} name={p.name} />
    ),
    meta: NOWRAP
  },
  // Who can get in (curated; blank where not).
  {
    id: 'admission',
    header: 'Admission',
    accessorFn: p => p.info?.admission?.kind ?? '',
    cell: ({ row: { original: p } }) => (
      <AdmissionBadge admission={p.info?.admission} />
    ),
    meta: NOWRAP
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
        {/* This epoch's adds and drops (the validators on hover) where
            the API has them, else the net change. */}
        {p.addedCount != null || p.droppedCount != null ? (
          <span className="fs-10 d-block lh-1">
            {!!p.addedCount && (
              <span
                className="text-success"
                title={`Started delegating to:\n${refList(p.added, x => x.stake, p.addedCount - (p.added?.length ?? 0))}`}
              >
                +{p.addedCount.toLocaleString()}
              </span>
            )}
            {!!p.addedCount && !!p.droppedCount && ' '}
            {!!p.droppedCount && (
              <span
                className="text-danger"
                title={`Stopped delegating to:\n${refList(p.dropped, x => x.stakePrev, p.droppedCount - (p.dropped?.length ?? 0))}`}
              >
                −{p.droppedCount.toLocaleString()}
              </span>
            )}
          </span>
        ) : (
          <Delta
            now={p.validators}
            prev={p.validatorsPrev}
            format={signedCount}
            below
          />
        )}
      </>
    ),
    meta: END
  },
  // Its directed share (JitoSOL, bSOL, JSOL, vSOL): stake its holders, a
  // protocol, the pool itself or matching chose (who, on hover).
  ...(showDirected
    ? [
        {
          id: 'directed',
          header: 'Directed',
          accessorFn: (p: PoolSummary) =>
            p.directed && p.stake ? sumBy(poolDirectedBy(p)) / p.stake : -1,
          cell: ({
            row: { original: p }
          }: {
            row: { original: PoolSummary };
          }) =>
            p.directed && p.stake && sumBy(poolDirectedBy(p)) > 0 ? (
              <span
                title={`${compactSol(sumBy(poolDirectedBy(p)))} directed${
                  p.directed.basis === 'target' ? ' (targets)' : ''
                }: ${choosersLine(poolDirectedBy(p))}`}
              >
                {pct(sumBy(poolDirectedBy(p)) / p.stake)}
              </span>
            ) : (
              <span className="text-body-quaternary">—</span>
            ),
          meta: END
        } as ColumnDef<PoolSummary>
      ]
    : []),
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
          meta: END
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
          meta: END
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
  // Stake pools (as the Kind column labels them: mSOL is one, Marinade's
  // direct delegations and SFDP aren't) spread over many validators.
  const isPool = (p: PoolSummary) => kindOf(p.kind, p.name) === KIND.pool;
  const multi = allPools.filter(
    p => isPool(p) && p.validators >= MIN_VALIDATORS
  );
  // Shown once the API gives each pool's median delegation.
  const showMedian = allPools.some(p => p.medianStake != null);
  // And once it gives their fees.
  const showFees = allPools.some(p => p.fees != null);
  // And its largest single delegation.
  const showMax = allPools.some(p => p.maxStake != null);
  // And holder-directed stake, where a pool has it.
  const showDirected = allPools.some(p => p.directed != null);
  // Totals and shares are over every pool, shown or not.
  const total = useMemo(
    () => allPools.reduce((a, p) => a + p.stake, 0),
    [allPools]
  );
  const table = useAdvanceTable({
    columns: useMemo(
      () => columns(showMedian, showFees, showMax, showDirected),
      [showMedian, showFees, showMax, showDirected]
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
          <h1 className="h3">Stake Pools</h1>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">
            Where stake pools and delegation programs put their stake
          </p>
        </div>
      </div>

      {!data ? (
        slice?.error ? (
          <UntrackedState>
            Stake pools aren&apos;t available right now.
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
                value={allPools.filter(isPool).length.toLocaleString()}
                sublabel={`${compactSol(
                  allPools.filter(isPool).reduce((a, p) => a + p.stake, 0)
                )} delegated`}
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
                label="Multi-validator Pools"
                value={multi.length.toLocaleString()}
                wrapSublabel
                sublabel={`stake pools delegating to ${MIN_VALIDATORS}+ validators · ${compactSol(
                  multi.reduce((a, p) => a + p.stake, 0)
                )}`}
              />
            </div>
          </div>

          <SectionCard
            title="All Stakers"
            icon="layers"
            info="Stake pools, Marinade and SFDP: their stake and how many validators they delegate to (over 50 SOL), at the end of the epoch. From Jito's stake-meta files."
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
          </SectionCard>
        </div>
      )}
    </div>
  );
};

export default StakePools;
