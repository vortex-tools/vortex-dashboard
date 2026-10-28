import { ColumnDef } from '@tanstack/react-table';
import FeatherIcon from 'feather-icons-react';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import Badge from 'components/base/Badge';
import DelayedSpinner from 'components/common/DelayedSpinner';
import SearchBox from 'components/common/SearchBox';
import SectionCard from 'components/common/SectionCard';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import {
  CLUSTERS,
  StageChip,
  clusterLabel,
  gateName,
  simdLabel
} from 'components/features/features';
import useAdvanceTable from 'hooks/useAdvanceTable';
import useCluster from 'hooks/useCluster';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import { FEATURES_KEY, VortexDataContext } from 'providers/VortexDataProvider';
import { SimdSummary } from 'providers/vortex-schemas';
import { useContext, useEffect, useMemo, useState } from 'react';
import { ButtonGroup, ToggleButton } from 'react-bootstrap';
import { Link } from 'react-router';

export const SIMD_REPO =
  'https://github.com/solana-foundation/solana-improvement-documents';

/** How a SIMD sorts on a cluster: next to activate first, then partly
 *  active, pending, active (newest first), and those with no gate. */
const stageRank = (s: SimdSummary, cluster: string) => {
  const r = s.rollup[cluster];
  if (!r || r.stage === 'noGate' || !r.gates) return 4e9;
  if (r.queued) return 0;
  if (r.stage === 'partial') return 1 + (r.nextQueuePosition ?? 1e3);
  if (r.stage === 'pending') return 2e3 + (r.nextQueuePosition ?? 1e6);
  return 2e9 - (r.lastActivationEpoch ?? 0);
};

const FILTERS = [
  ['gated', 'With gates'],
  ['pending', 'Pending'],
  ['active', 'Active'],
  ['review', 'In review'],
  ['all', 'All']
] as const;
type Filter = (typeof FILTERS)[number][0];

const NAME_WIDTH = { maxWidth: 'min(60vw, 30rem)' };
const NOWRAP = {
  headerProps: { className: 'text-nowrap' },
  cellProps: { className: 'text-nowrap' }
};

const columns = (served: string): ColumnDef<SimdSummary>[] => [
  {
    id: 'simd',
    header: 'SIMD',
    accessorFn: s => s.simd,
    cell: ({ row: { original: s } }) => (
      <Link to={`/simd/${s.simd}`} className="font-monospace">
        {simdLabel(s.simd)}
      </Link>
    ),
    meta: NOWRAP
  },
  {
    id: 'title',
    header: 'Title',
    accessorFn: s =>
      `${s.title ?? s.openPrs[0]?.title ?? ''} ${s.authors.join(' ')} ${s.gates.map(g => g.name ?? g.id).join(' ')}`,
    cell: ({ row: { original: s } }) => {
      const prTitle = s.openPrs[0]?.title;
      const title = s.title ?? (prTitle ? gateName(prTitle) : null);
      return (
        <span className="d-flex align-items-center gap-2">
          <Link
            to={`/simd/${s.simd}`}
            className="d-block text-truncate"
            style={NAME_WIDTH}
            title={title ?? undefined}
          >
            {title ?? <span className="text-body-tertiary">Untitled</span>}
          </Link>
          {s.openPrs.length > 0 && (
            <Badge
              bg="secondary"
              className="text-nowrap"
              title={s.openPrs
                .map(p => `#${p.pr}${p.title ? `: ${p.title}` : ''}`)
                .join('\n')}
            >
              {s.inRepo ? 'Amendment PR' : 'Open PR'}
            </Badge>
          )}
        </span>
      );
    },
    meta: NOWRAP
  },
  ...[...CLUSTERS]
    .sort((a, b) => Number(b.key === served) - Number(a.key === served))
    .map(
      (c): ColumnDef<SimdSummary> => ({
        id: c.key,
        header: c.label,
        accessorFn: s => stageRank(s, c.key),
        cell: ({ row: { original: s } }) => (
          <StageChip rollup={s.rollup[c.key]} />
        ),
        meta: NOWRAP
      })
    )
];

/**
 * Solana Improvement Documents: every proposal in the SIMD repo (and
 * those only an open PR proposes), with how far the feature gates that
 * implement each have activated per cluster. Activation is per gate, so
 * this is a view over the same data as Feature Gates.
 */
const Simds = () => {
  const context = useContext(VortexDataContext);
  const slice = context?.simdsState;
  const fetchData = slice?.fetchData;
  const data = slice?.data.get(FEATURES_KEY);
  useEffect(() => {
    fetchData?.(FEATURES_KEY);
  }, [fetchData]);
  const served = useCluster().cluster ?? 'mainnet-beta';
  const [filter, setFilter] = useState<Filter>('gated');

  const simds = useMemo(() => data?.simds ?? [], [data]);
  const counts = useMemo(() => {
    const c = {
      all: simds.length,
      gated: 0,
      pending: 0,
      active: 0,
      review: 0
    };
    let partial = 0;
    for (const s of simds) {
      const st = s.rollup[served]?.stage ?? 'noGate';
      if (st !== 'noGate') c.gated++;
      if (st === 'active') c.active++;
      else if (st === 'pending' || st === 'partial') c.pending++;
      if (st === 'partial') partial++;
      if (s.openPrs.length) c.review++;
    }
    return { ...c, partial };
  }, [simds, served]);
  const shown = useMemo(
    () =>
      simds.filter(s => {
        const st = s.rollup[served]?.stage ?? 'noGate';
        return filter === 'all'
          ? true
          : filter === 'review'
            ? s.openPrs.length > 0
            : filter === 'gated'
              ? st !== 'noGate'
              : filter === 'active'
                ? st === 'active'
                : st === 'pending' || st === 'partial';
      }),
    [simds, filter, served]
  );
  const table = useAdvanceTable({
    columns: useMemo(() => columns(served), [served]),
    data: shown,
    sortable: true,
    pagination: true,
    pageSize: 25,
    getRowId: s => String(s.simd),
    resetPageKey: filter,
    initialState: { sorting: [{ id: served, desc: false }] }
  });

  return (
    <div className="mb-9">
      <div className="page-header row g-3 align-items-start justify-content-between">
        <div className="col-auto">
          <h3>SIMDs</h3>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">
            Solana Improvement Documents, and how far their feature gates have
            activated
          </p>
        </div>
        <div className="col-auto">
          <a
            href={SIMD_REPO}
            target="_blank"
            rel="noreferrer"
            className="btn btn-soft-secondary btn-sm d-inline-flex align-items-center gap-1"
          >
            SIMD Repository
            <FeatherIcon icon="arrow-up-right" size={12} />
          </a>
        </div>
      </div>

      {!data ? (
        slice?.error ? (
          <UntrackedState>
            SIMDs aren&apos;t available from this API yet.
          </UntrackedState>
        ) : (
          <DelayedSpinner loading label="Loading SIMDs…" />
        )
      ) : (
        <div className="d-flex flex-column gap-3">
          <div className="row g-3">
            <div className="col-6 col-lg-3">
              <StatCard
                label="Proposals"
                value={counts.all.toLocaleString()}
                sublabel={`${counts.gated.toLocaleString()} with a feature gate`}
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label={`Active on ${clusterLabel(served)}`}
                value={counts.active.toLocaleString()}
                sublabel="every gate active"
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="Pending"
                value={counts.pending.toLocaleString()}
                sublabel={
                  counts.partial
                    ? `${counts.partial} partly active`
                    : 'gates not active yet'
                }
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="Without a Gate"
                value={(counts.all - counts.gated).toLocaleString()}
                sublabel="process, standards, or not built"
              />
            </div>
          </div>

          <SectionCard
            title="All SIMDs"
            icon="file-text"
            info="Every SIMD proposal, and how far its feature gates have activated on each cluster. In review: open as a pull request."
          >
            <AdvanceTableProvider {...table}>
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                <SearchBox
                  placeholder="Search SIMDs, titles, authors, gates"
                  onChange={e =>
                    table.setGlobalFilter(e.target.value || undefined)
                  }
                />
                <ButtonGroup size="sm">
                  {FILTERS.map(([k, label]) => (
                    <ToggleButton
                      key={k}
                      id={`simds-filter-${k}`}
                      type="radio"
                      name="simds-filter"
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
              Pending and Active are on {clusterLabel(served)}.
            </p>
          </SectionCard>
        </div>
      )}
    </div>
  );
};

export default Simds;
