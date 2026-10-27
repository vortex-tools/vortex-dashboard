import AddressLine from 'components/common/AddressLine';
import DelayedSpinner from 'components/common/DelayedSpinner';
import SectionCard from 'components/common/SectionCard';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import AnnouncementsTable, {
  postedWhen
} from 'components/features/announcements';
import {
  CLUSTERS,
  MinVersions,
  ReadinessBar,
  SIMD_EXEMPT_REASON,
  SIMD_SOURCE,
  SimdLinks,
  clientLabel,
  clusterLabel,
  featureName,
  gateName,
  inLine,
  pctOf
} from 'components/features/features';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { FeatureClusterState, FeatureGate } from 'providers/vortex-schemas';
import { Fragment, ReactNode, useContext, useEffect } from 'react';
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

const Row2 = ({ label, children }: { label: string; children: ReactNode }) => (
  <>
    <dt className="col-4 fw-normal text-body-tertiary">{label}</dt>
    <dd className="col-8 mb-0">{children}</dd>
  </>
);

const ext = (href: string, text: ReactNode) => (
  <a href={href} target="_blank" rel="noreferrer">
    {text}
  </a>
);

/** "anza-xyz/agave#10348": a PR or commit, linked. */
const gitText = (
  g: NonNullable<FeatureGate['previousIds']>[number]['replacedIn']
) =>
  g
    ? `${g.repo ?? ''}${g.pr != null ? `#${g.pr}` : g.commit ? `@${g.commit.slice(0, 7)}` : ''}`
    : '—';

/** "solana-labs/solana#29708" from an issue URL. */
const issueText = (url: string) => {
  const m = url.match(/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/);
  return m ? `${m[1]}#${m[2]}` : url;
};

/** Required features not yet active on a cluster, by name. */
const blockedText = (f: FeatureGate, s: FeatureClusterState | undefined) => {
  const ids = s?.blockedBy ?? [];
  if (!ids.length) return null;
  return ids.map((id, i) => {
    const req = f.requires?.find(q => q.id === id);
    return (
      <Fragment key={id}>
        {i > 0 && ', '}
        <Link to={`/feature/${id}`}>
          {req?.name ? gateName(req.name) : `${id.slice(0, 6)}…`}
        </Link>
      </Fragment>
    );
  });
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
            const blocked = blockedText(f, s);
            return (
              <Col key={c.key} xs={12} md={4}>
                <StatCard
                  label={c.label}
                  mono={false}
                  value={t.value}
                  wrapSublabel
                  sublabel={
                    <>
                      {t.sub}
                      {blocked && (
                        <span className="d-block text-warning-emphasis">
                          Can&apos;t take effect before {blocked}
                        </span>
                      )}
                      {s?.announced && (
                        <span className="d-block">
                          {s.announced.url
                            ? ext(s.announced.url, 'Announced')
                            : 'Announced'}
                          {s.announced.epoch != null
                            ? ` for epoch ${s.announced.epoch.toLocaleString()}`
                            : s.announced.postedAt
                              ? ` ${postedWhen(s.announced.postedAt)}`
                              : ''}
                        </span>
                      )}
                    </>
                  }
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
                <Row2 label="SIMD">
                  {f.simds.length ? (
                    <SimdLinks simds={f.simds} />
                  ) : f.simdExempt ? (
                    <span className="text-body-secondary">
                      None needed
                      {f.simdExemptReason &&
                        SIMD_EXEMPT_REASON[f.simdExemptReason] &&
                        `: ${SIMD_EXEMPT_REASON[f.simdExemptReason]}`}
                    </span>
                  ) : (
                    <SimdLinks simds={[]} />
                  )}
                  {f.simdConflict && (
                    <span className="d-block text-warning-emphasis fs-10">
                      Sources disagree on its SIMD: see below.
                    </span>
                  )}
                </Row2>
                {(f.relatedSimds?.length ?? 0) > 0 && (
                  <Row2 label="Related SIMDs">
                    <SimdLinks simds={f.relatedSimds!.map(x => x.simd)} />
                  </Row2>
                )}
                {(f.requires?.length ?? 0) > 0 && (
                  <Row2 label="Requires">
                    {f.requires!.map((q, i) => (
                      <Fragment key={q.id}>
                        {i > 0 && ', '}
                        <Link to={`/feature/${q.id}`}>
                          {q.name ? gateName(q.name) : `${q.id.slice(0, 6)}…`}
                        </Link>
                      </Fragment>
                    ))}
                    <span className="d-block text-body-tertiary fs-10">
                      active first, for this one to take effect
                    </span>
                  </Row2>
                )}
                <dt className="col-4 fw-normal text-body-tertiary">
                  Minimum versions
                </dt>
                <dd className="col-8 mb-0">
                  <MinVersions versions={f.minVersions} />
                </dd>
                {f.links?.introducedIn?.url && (
                  <Row2 label="Introduced in">
                    {ext(
                      f.links.introducedIn.url,
                      gitText(f.links.introducedIn)
                    )}
                    {f.links.introducedIn.date && (
                      <span className="text-body-tertiary">
                        {' '}
                        · {f.links.introducedIn.date}
                      </span>
                    )}
                  </Row2>
                )}
                {f.links?.source && (
                  <Row2 label="Source">
                    {ext(f.links.source, 'feature-set declaration')}
                  </Row2>
                )}
                {(f.links?.trackingIssues.length ?? 0) > 0 && (
                  <Row2 label="Tracking issue">
                    {f.links!.trackingIssues.map((u, i) => (
                      <Fragment key={u}>
                        {i > 0 && ', '}
                        {ext(u, issueText(u))}
                      </Fragment>
                    ))}
                  </Row2>
                )}
                {(f.previousIds?.length ?? 0) > 0 && (
                  <Row2 label="Previous ids">
                    {f.previousIds!.map(p => {
                      const on = CLUSTERS.filter(c => p.activations[c.key]);
                      return (
                        <span key={p.id} className="d-block">
                          <span className="font-monospace fs-10">
                            {p.id.slice(0, 8)}…
                          </span>
                          {p.replacedIn?.url && (
                            <span className="text-body-tertiary">
                              {' '}
                              · rekeyed in{' '}
                              {ext(p.replacedIn.url, gitText(p.replacedIn))}
                            </span>
                          )}
                          {on.length > 0 && (
                            <span className="text-body-tertiary">
                              {' '}
                              · had activated on{' '}
                              {on.map(c => c.label).join(', ')}
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </Row2>
                )}
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
                      {r.byClient
                        .filter(c => c.client !== 'frankendancer')
                        .map(c => (
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

        {(f.simdSources?.length ?? 0) > 0 && (
          <SectionCard
            title="SIMD Sources"
            icon="git-merge"
            info="No source is authoritative: each is kept by hand. Every SIMD any source ties to this gate, and who says so - the Feature Gate Tracker, agave's feature name, the SIMD's own feature line, the tracking issue, the SIMD's text, or our review where we reconciled them."
          >
            {f.simdConflict && (
              <p className="fs-9 text-warning-emphasis mb-2">
                The sources naming a SIMD for this gate disagree.
              </p>
            )}
            <Table size="sm" className="data-table compact-rows fs-9 mb-0">
              <thead>
                <tr>
                  <th>SIMD</th>
                  <th>Role</th>
                  <th>According to</th>
                </tr>
              </thead>
              <tbody>
                {f.simdSources!.map(x => (
                  <tr key={`${x.simd}-${x.role}`}>
                    <td className="text-nowrap">
                      <SimdLinks simds={[x.simd]} />
                    </td>
                    <td className="text-nowrap">
                      {x.role === 'related' ? 'Related' : 'Specifies it'}
                    </td>
                    <td className="text-body-secondary">
                      {x.sources.map(src => SIMD_SOURCE[src] ?? src).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </SectionCard>
        )}
        {!f.simdSources?.length && (f.noSimdEvidence?.length ?? 0) > 0 && (
          <p className="fs-9 text-body-tertiary mb-0">
            Needs no SIMD according to{' '}
            {f.noSimdEvidence!.map((u, i) => (
              <Fragment key={u}>
                {i > 0 && ', '}
                {ext(u, issueText(u))}
              </Fragment>
            ))}
            .
          </p>
        )}

        {(f.announcements?.length ?? 0) > 0 && (
          <SectionCard
            title="Announcements"
            icon="volume-2"
            info="Posts in Solana Tech's announcement channels naming this gate, newest first. Only the facts read from each post are kept; the post itself is linked."
          >
            <AnnouncementsTable announcements={f.announcements!} />
          </SectionCard>
        )}

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
