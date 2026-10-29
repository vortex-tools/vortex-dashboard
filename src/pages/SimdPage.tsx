import BackLink from 'components/common/BackLink';
import FeatherIcon from 'feather-icons-react';
import Badge from 'components/base/Badge';
import DelayedSpinner from 'components/common/DelayedSpinner';
import SectionCard from 'components/common/SectionCard';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import {
  CLUSTERS,
  StatusChip,
  featureName,
  gateName,
  inLine,
  simdLabel
} from 'components/features/features';
import { SIMD_REPO } from 'pages/Simds';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { FeatureGate, SimdDetail, SimdRollup } from 'providers/vortex-schemas';
import { Fragment, useContext, useEffect } from 'react';
import { Col, Row, Table } from 'react-bootstrap';
import { Link, useParams } from 'react-router';

/** A cluster's rollup as a stat card value and sublabel. */
const rollupText = (r: SimdRollup | undefined) => {
  if (!r || r.stage === 'noGate' || !r.gates)
    return { value: 'No gate', sub: 'no feature gate implements it' };
  const span =
    r.firstActivationEpoch != null && r.lastActivationEpoch != null
      ? r.firstActivationEpoch === r.lastActivationEpoch
        ? `epoch ${r.firstActivationEpoch.toLocaleString()}`
        : `epochs ${r.firstActivationEpoch.toLocaleString()}-${r.lastActivationEpoch.toLocaleString()}`
      : null;
  if (r.stage === 'active')
    return {
      value: 'Active',
      sub: `${r.gates > 1 ? `all ${r.gates} gates` : 'its gate'}${span ? ` · ${span}` : ''}`
    };
  const next = r.queued
    ? `${r.gates > 1 ? 'next gate activates' : 'activates'} at the next epoch boundary`
    : r.nextQueuePosition != null
      ? `${r.gates > 1 ? 'next gate' : 'its gate'} is ${inLine(r.nextQueuePosition).toLowerCase()}`
      : 'none scheduled';
  if (r.stage === 'partial')
    return {
      value: `${r.active} of ${r.gates} active`,
      sub: next
    };
  return { value: 'Pending', sub: next };
};

const LIST = ({ label, simds }: { label: string; simds: number[] }) =>
  simds.length ? (
    <>
      <dt className="col-4 fw-normal text-body-tertiary">{label}</dt>
      <dd className="col-8 mb-0">
        {simds.map((n, i) => (
          <Fragment key={n}>
            {i > 0 && ', '}
            <Link to={`/simd/${n}`}>{simdLabel(n)}</Link>
          </Fragment>
        ))}
      </dd>
    </>
  ) : null;

type SimdEvent = SimdDetail['events'][number];

const eventText = (e: SimdEvent) => {
  switch (e.kind) {
    case 'proposed':
      return 'Proposed';
    case 'amendmentProposed':
      return 'Amendment proposed';
    case 'prClosed':
      return 'Pull request closed';
    case 'merged':
      return 'Merged into the repository';
    case 'statusChanged':
      return e.from ? `Status ${e.from} → ${e.to ?? '—'}` : `Status ${e.to}`;
    case 'featureChanged':
      return 'Feature line changed';
    case 'removed':
      return 'Removed from the repository';
    default:
      return e.kind;
  }
};

const shortId = (id: string) => `${id.slice(0, 6)}…`;

const GatesTable = ({ gates }: { gates: FeatureGate[] }) => (
  <Table responsive size="sm" className="data-table fs-9 mb-0">
    <thead>
      <tr>
        <th>Feature</th>
        {CLUSTERS.map(c => (
          <th key={c.key} className="text-nowrap">
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {[...gates]
        .sort((a, b) =>
          featureName(a).localeCompare(featureName(b), undefined, {
            numeric: true
          })
        )
        .map(f => (
          <tr key={f.id}>
            <td>
              <Link
                to={`/feature/${f.id}`}
                className="d-block text-truncate"
                style={{ maxWidth: 'min(60vw, 30rem)' }}
                title={featureName(f)}
              >
                {featureName(f)}
              </Link>
            </td>
            {CLUSTERS.map(c => (
              <td key={c.key} className="text-nowrap">
                <StatusChip state={f.clusters[c.key]} />
              </td>
            ))}
          </tr>
        ))}
    </tbody>
  </Table>
);

/**
 * One SIMD: the proposal (title, authors, status, links), how far its
 * gates have activated on each cluster, the gates themselves and the
 * ones only related to it, open pull requests, and its history in the
 * SIMD repository.
 */
const SimdPage = () => {
  const { simd: param = '' } = useParams();
  const n = Number(param.replace(/^simd-?/i, ''));
  const valid = Number.isInteger(n) && n >= 0;
  const context = useContext(VortexDataContext);
  const slice = context?.simdState;
  const fetchData = slice?.fetchData;
  const data = valid ? slice?.data.get(n) : undefined;
  useEffect(() => {
    if (valid) fetchData?.(n);
  }, [valid, n, fetchData]);

  if (!data)
    return (
      <div className="mb-9 pt-4">
        {!valid || slice?.error ? (
          <UntrackedState>
            No SIMD with this number. <Link to="/features">Feature gates</Link>
          </UntrackedState>
        ) : (
          <DelayedSpinner loading label="Loading the SIMD…" />
        )}
      </div>
    );

  const s = data.simd;
  const prTitle = s.openPrs[0]?.title;
  const title = s.title ?? (prTitle ? gateName(prTitle) : null);
  const events = [...data.events].reverse();

  return (
    <div className="mb-9">
      <div className="page-header row g-3 align-items-start justify-content-between">
        <div className="col">
          <h3>
            {simdLabel(s.simd)}
            {title && `: ${title}`}
          </h3>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">
            {[
              s.authors.join(', '),
              [s.kind, s.category].filter(Boolean).join(' · '),
              s.created && `created ${s.created}`
            ]
              .filter(Boolean)
              .join(' — ')}
          </p>
        </div>
        <div className="col-auto d-flex flex-wrap gap-2">
          {/* Reached from Feature Gates (the SIMDs list is hidden). */}
          <BackLink to="/features" label="Feature gates" />
          {s.url && (
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-soft-secondary btn-sm d-inline-flex align-items-center gap-1"
            >
              {s.inRepo ? 'Proposal' : 'Pull Request'}
              <FeatherIcon icon="arrow-up-right" size={12} />
            </a>
          )}
        </div>
      </div>

      <div className="d-flex flex-column gap-3">
        <Row className="g-3">
          {CLUSTERS.map(c => {
            const r = s.rollup[c.key];
            const t = rollupText(r);
            return (
              <Col key={c.key} xs={12} md={4}>
                <StatCard
                  label={c.label}
                  mono={false}
                  value={t.value}
                  sublabel={t.sub}
                  check={r?.stage === 'active' ? true : null}
                />
              </Col>
            );
          })}
        </Row>

        <Row className="g-3">
          <Col xs={12} lg={5}>
            <SectionCard
              title="Proposal"
              icon="file-text"
              info="From the proposal's front matter in the SIMD repository. Its status is kept by hand and is often behind the chain; the cluster cards above come from the gates' activation."
            >
              <dl className="row fs-9 mb-0 gy-2">
                <dt className="col-4 fw-normal text-body-tertiary">
                  Repo status
                </dt>
                <dd className="col-8 mb-0">
                  {s.repoStatus ??
                    (s.inRepo ? '—' : 'Not in the repository yet')}
                </dd>
                <LIST label="Supersedes" simds={s.supersedes} />
                <LIST label="Superseded by" simds={s.supersededBy} />
                <LIST label="Extends" simds={s.extends} />
                {s.openPrs.length > 0 && (
                  <>
                    <dt className="col-4 fw-normal text-body-tertiary">
                      Open PRs
                    </dt>
                    <dd className="col-8 mb-0">
                      {s.openPrs.map(p => (
                        <div key={p.pr}>
                          <a
                            href={p.url ?? `${SIMD_REPO}/pull/${p.pr}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            #{p.pr}
                          </a>{' '}
                          {p.kind === 'amendment' && (
                            <Badge bg="secondary">Amendment</Badge>
                          )}{' '}
                          {p.draft && <Badge bg="secondary">Draft</Badge>}{' '}
                          <span className="text-body-tertiary">
                            {p.title}
                            {p.updated && ` · updated ${p.updated}`}
                          </span>
                        </div>
                      ))}
                    </dd>
                  </>
                )}
              </dl>
            </SectionCard>
          </Col>
          <Col xs={12} lg={7}>
            <SectionCard
              title="Feature Gates"
              icon="toggle-right"
              info="The gates that implement this SIMD, and their state on each cluster. Activation is per gate: a SIMD can have several, and a gate several SIMDs."
            >
              {data.features.length ? (
                <GatesTable gates={data.features} />
              ) : (
                <UntrackedState>No feature gate implements it.</UntrackedState>
              )}
              {data.relatedFeatures.length > 0 && (
                <>
                  <h6 className="fs-10 text-uppercase text-body-tertiary mt-4 mb-2">
                    Related gates
                  </h6>
                  <GatesTable gates={data.relatedFeatures} />
                  <p className="fs-10 text-body-tertiary mt-2 mb-0">
                    Gates that depend on or descend from this SIMD without
                    implementing it.
                  </p>
                </>
              )}
            </SectionCard>
          </Col>
        </Row>

        <SectionCard
          title="History"
          icon="clock"
          info="What happened to the proposal in the SIMD repository, newest first. Before our writer started, backfilled from the repository's git history."
        >
          {events.length ? (
            <Table
              size="sm"
              responsive
              className="data-table compact-rows fs-9 mb-0"
            >
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Event</th>
                  <th className="text-end">Source</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={`${e.kind}-${e.commit ?? e.pr}-${i}`}>
                    <td className="text-nowrap text-body-tertiary">
                      {e.date ?? '—'}
                    </td>
                    <td>
                      {eventText(e)}
                      {e.kind === 'featureChanged' &&
                        (e.fromIds.length > 0 || e.toIds.length > 0) && (
                          <span className="text-body-tertiary font-monospace fs-10">
                            {' '}
                            {e.fromIds.map(shortId).join(', ') || '—'} →{' '}
                            {e.toIds.map(id => (
                              <Link key={id} to={`/feature/${id}`}>
                                {shortId(id)}{' '}
                              </Link>
                            ))}
                          </span>
                        )}
                      {e.title && (
                        <span className="text-body-tertiary"> · {e.title}</span>
                      )}
                    </td>
                    <td className="text-end text-nowrap font-monospace fs-10">
                      {e.pr != null ? (
                        <a
                          href={`${SIMD_REPO}/pull/${e.pr}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          #{e.pr}
                        </a>
                      ) : e.commit ? (
                        <a
                          href={`${SIMD_REPO}/commit/${e.commit}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {e.commit.slice(0, 7)}
                        </a>
                      ) : (
                        '—'
                      )}
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

export default SimdPage;
