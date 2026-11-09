import { ColumnDef } from '@tanstack/react-table';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import PageBreadcrumb from 'components/common/PageBreadcrumb';
import PageSkeleton, { SKELETON } from 'components/common/PageSkeleton';
import SearchBox from 'components/common/SearchBox';
import SectionCard from 'components/common/SectionCard';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import ValidatorLink from 'components/common/ValidatorLink';
import ProviderMap, { MapPoint } from 'components/providers/ProviderMap';
import {
  groupProviders,
  placeName,
  ProviderLocation,
  providerPath
} from 'helpers/providers';
import useAdvanceTable from 'hooks/useAdvanceTable';
import { useValidatorGeoAt } from 'hooks/useValidatorGeo';
import { pct, sol } from 'pages/HostingProviders';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import { useAppContext } from 'providers/AppProvider';
import { ValidatorGeo } from 'providers/vortex-schemas';
import { useMemo, useState } from 'react';
import { Button, Col, Row, Table } from 'react-bootstrap';
import { Navigate, useParams } from 'react-router';

type Row_ = { v: ValidatorGeo; l: ProviderLocation; ofProvider: number };

const END = {
  headerProps: { className: 'text-nowrap text-end' },
  cellProps: { className: 'text-nowrap text-end' }
};

const columns: ColumnDef<Row_>[] = [
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
    header: 'Validator',
    accessorFn: r =>
      `${r.v.name ?? ''} ${r.v.nodeAddress} ${r.v.voteAddress ?? ''}`,
    cell: ({ row: { original: r } }) => (
      <div className="text-truncate" style={{ maxWidth: '22rem' }}>
        <ValidatorLink
          address={r.v.voteAddress ?? r.v.nodeAddress}
          title={r.v.name ?? r.v.nodeAddress}
        >
          {r.v.name ??
            `${r.v.nodeAddress.slice(0, 4)}…${r.v.nodeAddress.slice(-4)}`}
        </ValidatorLink>
      </div>
    )
  },
  {
    id: 'place',
    header: 'Location',
    accessorFn: r => placeName(r.l),
    cell: ({ row: { original: r } }) => (
      <span className="text-nowrap">
        {placeName(r.l)}
        {r.l.continent && (
          <span className="text-body-tertiary fs-10 ms-1">{r.l.continent}</span>
        )}
      </span>
    )
  },
  {
    id: 'stake',
    header: 'Stake',
    accessorFn: r => r.v.activatedStake,
    cell: ({ row: { original: r } }) => sol(r.v.activatedStake),
    meta: END
  },
  {
    id: 'share',
    header: 'Of Provider',
    accessorFn: r => r.ofProvider,
    cell: ({ row: { original: r } }) => pct(r.ofProvider, 2),
    meta: END
  }
];

/**
 * One hosting provider (/provider/:slug, or an ASN): its validators by
 * place - a map of its locations, a table of them (click one to see only
 * its validators) and its validators, from /validators/geo.
 */
const HostingProvider = () => {
  const { slug = '' } = useParams();
  const geo = useValidatorGeoAt(null);
  const { getThemeColor } = useAppContext();
  const grouped = useMemo(
    () => (geo ? groupProviders([...geo.byNode.values()]) : null),
    [geo]
  );
  // An ASN in the URL (/provider/20326) finds its provider.
  const asn = /^(?:as)?(\d+)$/i.exec(slug)?.[1];
  const p = grouped?.providers.find(x =>
    asn ? x.asns.includes(Number(asn)) : x.slug === slug
  );
  const [place, setPlace] = useState<string | null>(null);
  const chosen = p?.locations.find(l => l.key === place) ?? null;

  const rows = useMemo<Row_[]>(
    () =>
      p
        ? p.locations
            .filter(l => !chosen || l === chosen)
            .flatMap(l =>
              l.validators.map(v => ({
                v,
                l,
                ofProvider: p.stake ? v.activatedStake / p.stake : 0
              }))
            )
            // By stake, as the table sorts it, so # counts down it.
            .sort((a, b) => b.v.activatedStake - a.v.activatedStake)
        : [],
    [p, chosen]
  );
  const table = useAdvanceTable({
    columns,
    data: rows,
    sortable: true,
    pagination: true,
    pageSize: 25,
    getRowId: r => r.v.nodeAddress,
    resetPageKey: place ?? '',
    initialState: { sorting: [{ id: 'stake', desc: true }] }
  });

  const primary = getThemeColor('primary');
  const points = useMemo<MapPoint[]>(
    () =>
      (p?.locations ?? [])
        .filter(l => l.coord)
        .map(l => ({
          coord: l.coord!,
          stake: l.stake,
          color: chosen && l !== chosen ? getThemeColor('gray-400') : primary,
          tooltip: `<div class="fw-bold">${placeName(l)}</div>${l.validators.length} validator${l.validators.length === 1 ? '' : 's'} · ${sol(l.stake)}<br/>${p ? pct(l.stake / p.stake) : ''} of ${p?.name ?? ''}`
        })),
    [p, chosen, primary, getThemeColor]
  );
  const located = (p?.locations ?? []).filter(l => l.coord);

  const crumbs = [
    { label: 'Hosting Providers', url: '/providers' },
    { label: p?.name ?? 'Provider', active: true }
  ];

  if (!grouped)
    return (
      <div className="mb-9">
        <PageSkeleton rows={SKELETON.provider} header />
      </div>
    );
  if (!p)
    return (
      <div className="mb-9">
        <PageBreadcrumb items={crumbs} />
        <h1 className="h3">Provider not found</h1>
        <UntrackedState>
          No staked validator runs in a network called {slug} right now.
        </UntrackedState>
      </div>
    );
  // An ASN or an old name in the URL: its page's own path.
  if (asn) return <Navigate to={providerPath(p)} replace />;

  const top = p.locations[0];
  return (
    <div className="mb-9">
      <PageBreadcrumb items={crumbs} />
      <div className="page-header row g-3 align-items-start justify-content-between">
        <div className="col-auto">
          <h1 className="h3">{p.name}</h1>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">
            Hosting provider · {p.asns.map(a => `AS${a}`).join(', ')}
          </p>
        </div>
      </div>
      <div className="d-flex flex-column gap-3">
        <Row className="g-3">
          <Col xs={6} xl={3}>
            <StatCard
              label="Validators"
              value={p.validators.length.toLocaleString()}
              sublabel={`of ${grouped.providers.reduce((a, x) => a + x.validators.length, 0).toLocaleString()} located`}
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              label="Stake"
              value={sol(p.stake)}
              sublabel={`${pct(p.share, 2)} of stake · #${grouped.providers.indexOf(p) + 1} provider`}
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              label="Locations"
              value={p.locations.length.toLocaleString()}
              sublabel={`in ${p.countries} countr${p.countries === 1 ? 'y' : 'ies'}`}
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              label="Most Stake In"
              mono={false}
              value={placeName(top)}
              sublabel={`${pct(top.stake / p.stake)} of its stake · ${top.validators.length} validators`}
            />
          </Col>
        </Row>

        <SectionCard
          title="Coverage"
          icon="map"
          info="Its places (DB-IP's cities), sized by its validators' stake there. Click one to see only its validators."
        >
          <ProviderMap
            points={points}
            onClick={i =>
              setPlace(k =>
                k === located[i]?.key ? null : (located[i]?.key ?? null)
              )
            }
          />
        </SectionCard>

        <SectionCard
          title="Locations"
          icon="map-pin"
          info="Its validators by place, most stake first. Click a row to see only that place's validators below."
          aside={
            chosen ? (
              <Button
                size="sm"
                variant="soft-secondary"
                onClick={() => setPlace(null)}
              >
                Show all
              </Button>
            ) : undefined
          }
        >
          <Table responsive size="sm" className="data-table fs-9 mb-0">
            <thead>
              <tr className="text-nowrap">
                <th>Location</th>
                <th>Country</th>
                <th className="text-end">Validators</th>
                <th className="text-end">Stake</th>
                <th className="text-end">Of Provider</th>
                <th className="text-end">Of Stake</th>
              </tr>
            </thead>
            <tbody>
              {p.locations.map(l => (
                <tr
                  key={l.key}
                  role="button"
                  className={l === chosen ? 'table-active' : undefined}
                  onClick={() => setPlace(k => (k === l.key ? null : l.key))}
                >
                  <td className="fw-semibold text-nowrap">{placeName(l)}</td>
                  <td className="text-nowrap">
                    {l.country ?? l.countryCode ?? '—'}
                    {l.continent && (
                      <span className="text-body-tertiary fs-10 ms-1">
                        {l.continent}
                      </span>
                    )}
                  </td>
                  <td className="text-end">{l.validators.length}</td>
                  <td className="text-end text-nowrap">{sol(l.stake)}</td>
                  <td className="text-end">{pct(l.stake / p.stake)}</td>
                  <td className="text-end">
                    {pct(grouped.total ? l.stake / grouped.total : 0, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </SectionCard>

        <SectionCard
          title={chosen ? `Validators in ${placeName(chosen)}` : 'Validators'}
          icon="server"
          info="Its validators, by stake, with where each runs."
        >
          <AdvanceTableProvider {...table}>
            <div className="mb-3">
              <SearchBox
                placeholder="Search validators or places"
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

export default HostingProvider;
