import { ColumnDef } from '@tanstack/react-table';
import FeatherIcon from 'feather-icons-react';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import DelayedSpinner from 'components/common/DelayedSpinner';
import SearchBox from 'components/common/SearchBox';
import SectionCard from 'components/common/SectionCard';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import {
  CLUSTERS,
  MinVersions,
  ReadinessBar,
  SimdCell,
  StatusChip,
  clusterLabel,
  featureName,
  gateName
} from 'components/features/features';
import useAdvanceTable from 'hooks/useAdvanceTable';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import { FEATURES_KEY, VortexDataContext } from 'providers/VortexDataProvider';
import { FeatureGate } from 'providers/vortex-schemas';
import { useContext, useEffect, useMemo, useState } from 'react';
import { ButtonGroup, Table, ToggleButton } from 'react-bootstrap';
import { Link } from 'react-router';

/** How a gate sorts on a cluster: queued first, then by queue place, then
 *  the newest activations, then the unscheduled. */
const statusRank = (f: FeatureGate, cluster: string) => {
  const s = f.clusters[cluster];
  if (!s) return 4e9;
  if (s.status === 'queued') return 0;
  if (s.queuePosition != null) return s.queuePosition;
  if (s.status === 'active') return 1e9 - (s.epoch ?? 0);
  if (s.status === 'skipped') return 3.5e9;
  return 3e9;
};

/** Under a gate's name in Up Next: required gates not active yet (it
 *  can't take effect before them), and an announcement naming it. */
const UpNextNotes = ({ f, cluster }: { f: FeatureGate; cluster: string }) => {
  const s = f.clusters[cluster];
  const blocked = s?.blockedBy ?? [];
  const a = s?.announced;
  if (!blocked.length && !a) return null;
  return (
    <div className="fs-10 d-flex flex-wrap gap-2 mt-1">
      {blocked.length > 0 && (
        <span className="text-warning-emphasis">
          After{' '}
          {blocked.map((id, i) => (
            <span key={id}>
              {i > 0 && ', '}
              <Link to={`/feature/${id}`} className="text-warning-emphasis">
                {(n => (n ? gateName(n) : `${id.slice(0, 6)}…`))(
                  f.requires?.find(q => q.id === id)?.name
                )}
              </Link>
            </span>
          ))}
        </span>
      )}
      {a && (
        <span className="text-body-tertiary">
          {a.url ? (
            <a href={a.url} target="_blank" rel="noreferrer">
              Announced
            </a>
          ) : (
            'Announced'
          )}
          {a.epoch != null && ` for epoch ${a.epoch.toLocaleString()}`}
        </span>
      )}
    </div>
  );
};

const FILTERS = [
  ['all', 'All'],
  ['pending', 'Pending'],
  ['active', 'Active']
] as const;
type Filter = (typeof FILTERS)[number][0];

// A feature's name is cut short past this, so on a phone its first state
// column stays in view; the full name is on hover and its own page.
const NAME_WIDTH = { maxWidth: 'min(60vw, 32rem)' };

// Cells don't wrap: on a narrow screen the table scrolls sideways.
const NOWRAP = {
  headerProps: { className: 'text-nowrap' },
  cellProps: { className: 'text-nowrap' }
};

const columns = (served: string): ColumnDef<FeatureGate>[] => [
  {
    id: 'name',
    header: 'Feature',
    accessorFn: f =>
      `${featureName(f)} ${f.name ?? ''} ${f.id} ${f.simds.join(' ')}`,
    cell: ({ row: { original: f } }) => (
      <Link
        to={`/feature/${f.id}`}
        className="d-block text-truncate"
        style={NAME_WIDTH}
        title={featureName(f)}
      >
        {featureName(f)}
      </Link>
    ),
    meta: NOWRAP
  },
  {
    id: 'simd',
    header: 'SIMD',
    accessorFn: f => f.simds[0] ?? (f.simdExempt ? -1 : 0),
    cell: ({ row: { original: f } }) => <SimdCell f={f} />,
    meta: NOWRAP
  },
  // Mainnet, Devnet, Testnet on every cluster's site.
  ...CLUSTERS.map(
    (c): ColumnDef<FeatureGate> => ({
      id: c.key,
      header: c.label,
      accessorFn: f => statusRank(f, c.key),
      cell: ({ row: { original: f } }) => (
        <StatusChip state={f.clusters[c.key]} />
      ),
      meta: NOWRAP
    })
  )
];

/**
 * Solana feature gates: what's active on each cluster, what activates next
 * (with how much stake already runs a version that supports it), and every
 * gate. Status from the feature accounts on chain; the queue, titles and
 * min versions from the Agave wiki's tracker.
 */
const FeatureGates = () => {
  const context = useContext(VortexDataContext);
  const all = context?.featuresState;
  const up = context?.featuresUpcomingState;
  const data = all?.data.get(FEATURES_KEY);
  const upcoming = up?.data.get('');
  const fetchAll = all?.fetchData;
  const fetchUpcoming = up?.fetchData;
  useEffect(() => {
    fetchAll?.(FEATURES_KEY);
    fetchUpcoming?.('');
  }, [fetchAll, fetchUpcoming]);
  const served = upcoming?.cluster ?? 'mainnet-beta';
  const [filter, setFilter] = useState<Filter>('pending');

  const features = useMemo(() => data?.features ?? [], [data]);
  const shown = useMemo(
    () =>
      features.filter(f => {
        const s = f.clusters[served]?.status;
        return (
          filter === 'all' ||
          (filter === 'active'
            ? s === 'active'
            : s !== 'active' && s !== 'skipped')
        );
      }),
    [features, filter, served]
  );
  const table = useAdvanceTable({
    columns: useMemo(() => columns(served), [served]),
    data: shown,
    sortable: true,
    pagination: true,
    pageSize: 20,
    getRowId: f => f.id,
    resetPageKey: filter,
    initialState: { sorting: [{ id: 'mainnet-beta', desc: false }] }
  });

  const counts = useMemo(() => {
    let active = 0;
    let skipped = 0;
    for (const f of features) {
      const s = f.clusters[served]?.status;
      if (s === 'active') active++;
      else if (s === 'skipped') skipped++;
    }
    // Gates this cluster won't get aren't pending.
    return {
      all: features.length,
      active,
      pending: features.length - active - skipped
    };
  }, [features, served]);
  const floor = data?.clusters.find(c => c.cluster === served)?.versionFloor;
  const next = upcoming?.features[0];

  return (
    <div className="mb-9">
      <div className="page-header row g-3 align-items-start justify-content-between">
        <div className="col-auto">
          <h1 className="h3">Feature Gates</h1>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">
            What&apos;s active on each cluster, and what activates next
          </p>
        </div>
        {data?.wikiUrl && (
          <div className="col-auto">
            <a
              href={data.wikiUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-soft-secondary btn-sm d-inline-flex align-items-center gap-1"
            >
              Feature Gate Tracker
              <FeatherIcon icon="arrow-up-right" size={12} />
            </a>
          </div>
        )}
      </div>

      {!data ? (
        all?.error ? (
          <UntrackedState>
            Feature gates aren&apos;t available right now.
          </UntrackedState>
        ) : (
          <DelayedSpinner loading label="Loading feature gates…" />
        )
      ) : (
        <div className="d-flex flex-column gap-3">
          <div className="row g-3">
            <div className="col-6 col-lg-3">
              <StatCard
                label={`Active on ${clusterLabel(served)}`}
                value={counts.active.toLocaleString()}
                sublabel={`of ${counts.all.toLocaleString()} feature gates`}
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="Pending"
                value={counts.pending.toLocaleString()}
                sublabel={`${upcoming?.features.length ?? 0} scheduled in the tracker's queue`}
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="Next Up"
                mono={false}
                value={next ? featureName(next) : '—'}
                linkTo={next ? `/feature/${next.id}` : undefined}
                sublabel={
                  next?.readiness
                    ? `${Math.round((next.readiness.readyStake / Math.max(1, next.readiness.totalStake)) * 1000) / 10}% of stake ready`
                    : 'nothing scheduled'
                }
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="Minimum Supported Software"
                mono={false}
                value={
                  floor ? (
                    <MinVersions versions={floor.current} className="fs-9" />
                  ) : (
                    '—'
                  )
                }
                wrapSublabel
                sublabel={
                  floor && Object.values(floor.next).some(v => v.length) ? (
                    <>
                      next: <MinVersions versions={floor.next} />
                    </>
                  ) : (
                    `on ${clusterLabel(served)}`
                  )
                }
              />
            </div>
          </div>

          <SectionCard
            title={`Up Next on ${clusterLabel(served)}`}
            icon="clock"
            info="Queued gates activate at the next epoch; the rest wait in the tracker's order. Ready: stake running a version that supports the gate."
          >
            {upcoming?.features.length ? (
              <Table responsive size="sm" className="data-table fs-9 mb-0">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Feature</th>
                    <th className="text-nowrap">SIMD</th>
                    <th style={{ minWidth: '7rem' }}>Stake ready</th>
                    <th className="text-nowrap">Minimum versions</th>
                    {CLUSTERS.filter(c => c.key !== served).map(c => (
                      <th key={c.key} className="text-nowrap">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {upcoming.features.map((f, i) => (
                    <tr key={f.id}>
                      <td className="text-body-tertiary font-monospace">
                        {f.clusters[served]?.status === 'queued'
                          ? 'next epoch'
                          : i + 1}
                      </td>
                      <td>
                        <Link
                          to={`/feature/${f.id}`}
                          className="fw-semibold d-block text-truncate"
                          style={NAME_WIDTH}
                          title={featureName(f)}
                        >
                          {featureName(f)}
                        </Link>
                        <UpNextNotes f={f} cluster={served} />
                      </td>
                      <td className="text-nowrap">
                        <SimdCell f={f} />
                      </td>
                      <td>
                        <ReadinessBar readiness={f.readiness} />
                      </td>
                      <td className="fs-10 text-nowrap">
                        <MinVersions versions={f.minVersions} />
                      </td>
                      {CLUSTERS.filter(c => c.key !== served).map(c => (
                        <td key={c.key} className="text-nowrap">
                          <StatusChip state={f.clusters[c.key]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <UntrackedState>
                Nothing is scheduled on {clusterLabel(served)}.
              </UntrackedState>
            )}
          </SectionCard>

          <SectionCard
            title="All Feature Gates"
            icon="list"
            info="Every gate agave knows, with its state on each cluster: active from an epoch, activating at the next epoch boundary, waiting in the tracker's queue, or not scheduled."
          >
            <AdvanceTableProvider {...table}>
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                <SearchBox
                  placeholder="Search features, SIMDs, ids"
                  onChange={e =>
                    table.setGlobalFilter(e.target.value || undefined)
                  }
                />
                <ButtonGroup size="sm">
                  {FILTERS.map(([k, label]) => (
                    <ToggleButton
                      key={k}
                      id={`features-filter-${k}`}
                      type="radio"
                      name="features-filter"
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
              Pending and Active are on {clusterLabel(served)}; gates it
              won&apos;t get are in All only.
            </p>
          </SectionCard>
        </div>
      )}
    </div>
  );
};

export default FeatureGates;
