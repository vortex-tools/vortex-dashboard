import AddressLine from 'components/common/AddressLine';
import DelayedSpinner from 'components/common/DelayedSpinner';
import SectionCard from 'components/common/SectionCard';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import {
  CLUSTERS,
  MinVersions,
  ReadinessBar,
  SimdLinks,
  clientLabel,
  clusterLabel,
  featureName,
  inLine,
  pctOf
} from 'components/features/features';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { FeatureClusterState } from 'providers/vortex-schemas';
import { useContext, useEffect } from 'react';
import { Col, Row, Table } from 'react-bootstrap';
import { Link, useParams } from 'react-router';

const when = (unixS: number | null | undefined) =>
  unixS
    ? new Date(unixS * 1000).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : '—';

/** A cluster's state as a stat card value and sublabel. */
const stateText = (s: FeatureClusterState | undefined) => {
  if (!s) return { value: '—', sub: 'not tracked' };
  if (s.status === 'active')
    return {
      value: 'Active',
      sub:
        s.epoch != null
          ? `since epoch ${s.epoch.toLocaleString()}${s.slot != null ? ` · slot ${s.slot.toLocaleString()}` : ''}`
          : 'activated'
    };
  if (s.status === 'skipped')
    return { value: "Won't activate", sub: 'this cluster will not get it' };
  if (s.status === 'queued')
    return { value: 'Next epoch', sub: 'activates at the next epoch boundary' };
  if (s.queuePosition != null)
    return {
      value: inLine(s.queuePosition),
      sub: "in the tracker's activation queue"
    };
  return { value: 'Not scheduled', sub: "not in the tracker's queue" };
};

const EVENT: Record<string, string> = {
  scheduled: 'Scheduled',
  unscheduled: 'Unscheduled',
  queued: 'Queued',
  revoked: 'Revoked',
  activated: 'Activated'
};

/**
 * One feature gate: its state on each cluster, its SIMDs and min versions,
 * how much stake is ready for it (while it isn't active on the cluster
 * this API serves), and its history as our writer saw it.
 */
const FeatureGatePage = () => {
  const { id = '' } = useParams();
  const context = useContext(VortexDataContext);
  const slice = context?.featureState;
  const fetchData = slice?.fetchData;
  const data = slice?.data.get(id);
  useEffect(() => {
    if (id) fetchData?.(id);
  }, [id, fetchData]);

  if (!data)
    return (
      <div className="mb-9 pt-4">
        {slice?.error ? (
          <UntrackedState>
            No feature gate with this id.{' '}
            <Link to="/features">All feature gates</Link>
          </UntrackedState>
        ) : (
          <DelayedSpinner loading label="Loading the feature gate…" />
        )}
      </div>
    );

  const f = data.feature;
  const r = f.readiness;
  const events = [...data.events].reverse();

  return (
    <div className="mb-9">
      <div className="page-header row g-3 align-items-start justify-content-between">
        <div className="col">
          <h3>{featureName(f)}</h3>
          {f.name && f.title && f.name !== f.title && (
            <p className="text-body-tertiary lh-sm mb-0 mt-1">{f.name}</p>
          )}
        </div>
      </div>

      <div className="d-flex flex-column gap-3">
        <Row className="g-3">
          {CLUSTERS.map(c => {
            const s = f.clusters[c.key];
            const t = stateText(s);
            return (
              <Col key={c.key} xs={12} md={4}>
                <StatCard
                  label={c.label}
                  mono={false}
                  value={t.value}
                  sublabel={t.sub}
                  check={s?.status === 'active' ? true : null}
                />
              </Col>
            );
          })}
        </Row>

        <Row className="g-3">
          <Col xs={12} lg={6}>
            <SectionCard title="Details" icon="file-text">
              <AddressLine label="Feature id" value={f.id} />
              <dl className="row fs-9 mb-0 gy-2 mt-1">
                <dt className="col-4 fw-normal text-body-tertiary">SIMD</dt>
                <dd className="col-8 mb-0">
                  <SimdLinks simds={f.simds} />
                </dd>
                <dt className="col-4 fw-normal text-body-tertiary">
                  Minimum versions
                </dt>
                <dd className="col-8 mb-0">
                  <MinVersions versions={f.minVersions} />
                </dd>
                <dt className="col-4 fw-normal text-body-tertiary">Tracked</dt>
                <dd className="col-8 mb-0">
                  {data.wikiUrl ? (
                    <a href={data.wikiUrl} target="_blank" rel="noreferrer">
                      Feature Gate Tracker
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </dl>
            </SectionCard>
          </Col>
          <Col xs={12} lg={6}>
            <SectionCard
              title={
                r ? `Stake Ready on ${clusterLabel(r.cluster)}` : 'Stake Ready'
              }
              icon="check-circle"
              info="Activated stake whose node runs at least the gate's minimum version for its client (Jito is held to Agave's). Unknown: the node isn't in gossip, its version doesn't parse, or no minimum is listed for its client."
            >
              {r ? (
                <>
                  <ReadinessBar readiness={r} height={12} />
                  <Table
                    size="sm"
                    className="data-table compact-rows fs-9 mt-3 mb-0"
                  >
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Needs</th>
                        <th className="text-end">Ready</th>
                        <th className="text-end">Not ready</th>
                        <th className="text-end">Unknown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.byClient.map(c => (
                        <tr key={c.client}>
                          <td>{clientLabel(c.client)}</td>
                          <td className="font-monospace fs-10">
                            {c.minVersions
                              .map(v => v.replace(/^v/, ''))
                              .join(' / ') || '—'}
                          </td>
                          <td className="text-end font-monospace">
                            {pctOf(c.readyStake, r.totalStake)}
                          </td>
                          <td className="text-end font-monospace">
                            {c.notReadyStake
                              ? pctOf(c.notReadyStake, r.totalStake)
                              : '—'}
                          </td>
                          <td className="text-end font-monospace">
                            {c.unknownStake
                              ? pctOf(c.unknownStake, r.totalStake)
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  <p className="fs-10 text-body-tertiary mt-2 mb-0">
                    Shares of all activated stake.
                  </p>
                </>
              ) : (
                <UntrackedState>
                  Shown while the gate isn&apos;t active on the cluster this API
                  serves.
                </UntrackedState>
              )}
            </SectionCard>
          </Col>
        </Row>

        <SectionCard
          title="History"
          icon="clock"
          info="As our writer saw it, newest first: entering or leaving the tracker's queue, the feature account appearing (queued) or removed before activating (revoked), and activation. Its first run recorded every activation already on chain."
        >
          {events.length ? (
            <Table
              size="sm"
              responsive
              className="data-table compact-rows fs-9 mb-0 text-nowrap"
            >
              <thead>
                <tr>
                  <th>Cluster</th>
                  <th>Event</th>
                  <th>Epoch / slot</th>
                  <th className="text-end">Seen</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={`${e.cluster}-${e.kind}-${i}`}>
                    <td>{clusterLabel(e.cluster)}</td>
                    <td>
                      {EVENT[e.kind] ?? e.kind}
                      {e.queuePosition != null && (
                        <span className="text-body-tertiary">
                          {' '}
                          · {inLine(e.queuePosition).toLowerCase()}
                        </span>
                      )}
                    </td>
                    <td className="font-monospace">
                      {e.epoch != null ? e.epoch.toLocaleString() : '—'}
                      {e.slot != null && (
                        <span className="text-body-tertiary">
                          {' '}
                          · {e.slot.toLocaleString()}
                        </span>
                      )}
                    </td>
                    <td className="text-end text-body-tertiary text-nowrap">
                      {when(e.observedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <UntrackedState>No history recorded.</UntrackedState>
          )}
        </SectionCard>
      </div>
    </div>
  );
};

export default FeatureGatePage;
