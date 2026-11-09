import { ColumnDef } from '@tanstack/react-table';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import PageSkeleton, { SKELETON } from 'components/common/PageSkeleton';
import SearchBox from 'components/common/SearchBox';
import SectionCard from 'components/common/SectionCard';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import ProviderMap, { MapPoint } from 'components/providers/ProviderMap';
import {
  groupProviders,
  placeName,
  Provider,
  providerPath
} from 'helpers/providers';
import { formatLamports } from 'helpers/utils';
import useAdvanceTable from 'hooks/useAdvanceTable';
import { useValidatorGeoAt } from 'hooks/useValidatorGeo';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import { useAppContext } from 'providers/AppProvider';
import { useMemo, useState } from 'react';
import { Col, Row } from 'react-bootstrap';
import { Link } from 'react-router';

/** Providers the map colors (the rest share gray). */
const COLORED = 8;
const OTHER_COLOR = 'rgba(140, 150, 165, 0.9)';

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
export const sol = (lamports: number) => formatLamports(lamports, 0);

/** The map's colors for the largest providers, in order. */
export const useProviderColors = () => {
  const { getThemeColor } = useAppContext();
  return useMemo(
    () => [
      getThemeColor('primary'),
      'rgb(26, 153, 131)',
      getThemeColor('info'),
      getThemeColor('warning'),
      getThemeColor('danger'),
      getThemeColor('success'),
      'rgb(139, 92, 246)',
      'rgb(236, 72, 153)'
    ],
    [getThemeColor]
  );
};

const END = {
  headerProps: { className: 'text-nowrap text-end' },
  cellProps: { className: 'text-nowrap text-end' }
};

const columns: ColumnDef<Provider>[] = [
  {
    id: 'rank',
    header: '#',
    accessorFn: (_, i) => i + 1,
    cell: ({ row }) => (
      <span className="text-body-tertiary">{row.index + 1}</span>
    ),
    enableSorting: false
  },
  {
    id: 'name',
    header: 'Provider',
    accessorFn: p => `${p.name} ${p.asns.map(a => `AS${a}`).join(' ')}`,
    cell: ({ row: { original: p } }) => (
      <div className="text-truncate" style={{ maxWidth: '20rem' }}>
        <Link to={providerPath(p)} className="fw-semibold">
          {p.name}
        </Link>
        <div className="fs-10 text-body-tertiary text-truncate">
          {p.asns.map(a => `AS${a}`).join(', ')}
        </div>
      </div>
    )
  },
  {
    id: 'validators',
    header: 'Validators',
    accessorFn: p => p.validators.length,
    meta: END
  },
  {
    id: 'stake',
    header: 'Stake',
    accessorFn: p => p.stake,
    cell: ({ row: { original: p } }) => sol(p.stake),
    meta: END
  },
  {
    id: 'share',
    header: 'Of Stake',
    accessorFn: p => p.share,
    cell: ({ row: { original: p } }) => pct(p.share, 2),
    meta: END
  },
  {
    id: 'locations',
    header: 'Locations',
    accessorFn: p => p.locations.length,
    meta: END
  },
  {
    id: 'countries',
    header: 'Countries',
    accessorFn: p => p.countries,
    meta: END
  },
  {
    id: 'where',
    header: 'Most Stake In',
    accessorFn: p => p.locations.map(placeName).join(' '),
    cell: ({ row: { original: p } }) => {
      const top = p.locations.slice(0, 3).map(placeName).join(' · ');
      const more = p.locations.length - 3;
      return (
        <span className="text-body-secondary text-nowrap">
          {top}
          {more > 0 && (
            <span className="text-body-tertiary"> · {more} more</span>
          )}
        </span>
      );
    },
    enableSorting: false
  }
];

/** Fewest providers together holding over a third of the stake. */
const superminority = (providers: Provider[]) => {
  let sum = 0;
  let n = 0;
  for (const p of providers) {
    if (sum > 1 / 3) break;
    sum += p.share;
    n++;
  }
  return n;
};

/**
 * Hosting providers (/providers): every network validators run in - the
 * owner of the ASN their gossip address sits in (DB-IP), its ASNs
 * together - with its validators, stake and places, on a world map
 * colored by the largest. Each links to its own page.
 */
const HostingProviders = () => {
  const geo = useValidatorGeoAt(null);
  const colors = useProviderColors();
  const grouped = useMemo(
    () => (geo ? groupProviders([...geo.byNode.values()]) : null),
    [geo]
  );
  const providers = useMemo(() => grouped?.providers ?? [], [grouped]);

  // The legend's pick: one of the colored providers (its slug), the rest
  // ('others'), or every provider (null).
  const [pick, setPick] = useState<string | null>(null);
  const points = useMemo(() => {
    const out: MapPoint[] = [];
    // Others: one gray dot per place, all of them together.
    const other = new Map<
      string,
      { coord: [number, number]; stake: number; n: number; name: string }
    >();
    providers.forEach((p, i) =>
      p.locations.forEach(l => {
        if (!l.coord) return;
        if (i < COLORED) {
          if (pick && pick !== p.slug) return;
          out.push({
            coord: l.coord,
            stake: l.stake,
            color: colors[i],
            tooltip: `<div class="fw-bold">${p.name}</div>${placeName(l)}<br/>${l.validators.length} validator${l.validators.length === 1 ? '' : 's'} · ${sol(l.stake)}`
          });
        } else if (!pick || pick === 'others') {
          const o = other.get(l.key) ?? {
            coord: l.coord,
            stake: 0,
            n: 0,
            name: placeName(l)
          };
          o.stake += l.stake;
          o.n += l.validators.length;
          other.set(l.key, o);
        }
      })
    );
    for (const o of other.values())
      out.push({
        coord: o.coord,
        stake: o.stake,
        color: OTHER_COLOR,
        tooltip: `<div class="fw-bold">Other providers</div>${o.name}<br/>${o.n} validator${o.n === 1 ? '' : 's'} · ${sol(o.stake)}`
      });
    return out;
  }, [providers, colors, pick]);

  const table = useAdvanceTable({
    columns,
    data: providers,
    sortable: true,
    pagination: true,
    pageSize: 25,
    getRowId: p => p.slug,
    initialState: { sorting: [{ id: 'stake', desc: true }] }
  });

  const header = (
    <div className="page-header row g-3 align-items-start justify-content-between">
      <div className="col-auto">
        <h1 className="h3">Hosting Providers</h1>
        <p className="text-body-tertiary lh-sm mb-0 mt-1">
          Where validators run: the network each one&apos;s address is in, and
          its places
        </p>
      </div>
    </div>
  );

  if (!grouped)
    return (
      <div className="mb-9">
        {header}
        <PageSkeleton rows={SKELETON.providers} />
      </div>
    );
  if (!providers.length)
    return (
      <div className="mb-9">
        {header}
        <UntrackedState>No validator locations from this API.</UntrackedState>
      </div>
    );

  const largest = providers[0];
  return (
    <div className="mb-9">
      {header}
      <div className="d-flex flex-column gap-3">
        <Row className="g-3">
          <Col xs={6} xl={3}>
            <StatCard
              label="Providers"
              value={providers.length.toLocaleString()}
              sublabel={`hosting ${grouped.providers.reduce((a, p) => a + p.validators.length, 0).toLocaleString()} validators`}
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              label="Largest"
              mono={false}
              value={largest.name}
              sublabel={`${pct(largest.share)} of stake · ${largest.validators.length} validators`}
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              label="Over a Third"
              value={superminority(providers).toLocaleString()}
              sublabel="fewest providers holding over 1/3 of stake"
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              label="Not Located"
              value={pct(grouped.unlocated.share)}
              sublabel={`${grouped.unlocated.validators} validators · no address or network`}
            />
          </Col>
        </Row>

        <SectionCard
          title="Coverage"
          icon="map"
          info="Every provider's places: a dot per provider and city (DB-IP's), sized by its validators' stake. The largest providers each have a color; the rest are gray. Click a legend entry to see only its places (again for all); scroll or pinch to zoom, drag to pan."
        >
          <ProviderMap
            points={points}
            legend={
              <div className="d-flex flex-column fs-10">
                {[
                  ...providers.slice(0, COLORED).map((p, i) => ({
                    key: p.slug,
                    label: `${p.name} ${pct(p.share)}`,
                    color: colors[i],
                    path: providerPath(p)
                  })),
                  {
                    key: 'others',
                    label: 'Others',
                    color: OTHER_COLOR,
                    path: null
                  }
                ].map(x => (
                  <span
                    key={x.key}
                    className="d-inline-flex align-items-center gap-1"
                  >
                    <button
                      type="button"
                      className={`btn btn-link p-0 fs-10 text-start text-decoration-none d-inline-flex align-items-center gap-1 ${
                        pick && pick !== x.key
                          ? 'text-body-quaternary'
                          : 'text-body-secondary'
                      }`}
                      aria-pressed={pick === x.key}
                      title={
                        pick === x.key
                          ? 'Show every provider'
                          : 'Show only its locations'
                      }
                      onClick={() => setPick(k => (k === x.key ? null : x.key))}
                    >
                      <span
                        className="d-inline-block rounded-circle flex-shrink-0"
                        style={{ width: 9, height: 9, background: x.color }}
                      />
                      <span className={pick === x.key ? 'fw-bold' : ''}>
                        {x.label}
                      </span>
                    </button>
                    {pick === x.key && x.path && (
                      <Link to={x.path} className="ms-1">
                        Open →
                      </Link>
                    )}
                  </span>
                ))}
              </div>
            }
          />
        </SectionCard>

        <SectionCard
          title="Providers"
          icon="server"
          info="Each network validators' gossip addresses are in (the ASN owner, as DB-IP names it; one with several ASNs counted once), by stake. Locations: its cities."
        >
          <AdvanceTableProvider {...table}>
            <div className="mb-3">
              <SearchBox
                placeholder="Search providers, ASNs or places"
                onChange={e =>
                  table.setGlobalFilter(e.target.value || undefined)
                }
              />
            </div>
            <AdvanceTable
              tableProps={{ size: 'sm', className: 'data-table fs-9 mb-0' }}
            />
            <AdvanceTableFooter viewAll={false} />
          </AdvanceTableProvider>
        </SectionCard>
      </div>
    </div>
  );
};

export default HostingProviders;
