import FeatherIcon from 'feather-icons-react';
import Badge from 'components/base/Badge';
import { Announcement } from 'providers/vortex-schemas';
import { Table } from 'react-bootstrap';
import { Link } from 'react-router';
import { clusterLabel, simdLabel } from './features';

export const ANNOUNCEMENT_KIND: Record<string, string> = {
  restart: 'Restart',
  upgrade: 'Upgrade',
  feature: 'Feature activation',
  other: 'Announcement'
};

export const postedWhen = (unixS: number) =>
  new Date(unixS * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

/** Which client a version is: Firedancer's are calendar versions
 *  ("26.10.4"), Agave's semver ("4.4.0-rc.1"). */
export const clientOfVersion = (v: string) =>
  parseInt(v.replace(/^v/, ''), 10) >= 20 ? 'Firedancer' : 'Agave';

/** "Agave 4.4.0-beta.1 · Firedancer 26.10.4": the post's versions, by
 *  client. */
const byClient = (versions: string[]) => {
  const groups = new Map<string, string[]>();
  for (const v of versions)
    groups.set(clientOfVersion(v), [
      ...(groups.get(clientOfVersion(v)) ?? []),
      v
    ]);
  return [...groups].map(([c, vs]) => `${c} ${vs.join(', ')}`).join(' · ');
};
const versionsText = (a: Announcement) =>
  a.minVersions.length
    ? `at least ${byClient(a.minVersions)}`
    : byClient(a.versions);

/** The clients a post's versions are for. */
export const clientsOf = (a: Announcement) => [
  ...new Set([...a.versions, ...a.minVersions].map(clientOfVersion))
];

/** A release candidate ("4.4.0-rc.1"): an upgrade for some of the stake
 *  to try first, not for everyone. */
export const isCandidate = (a: Announcement) =>
  a.kind === 'upgrade' &&
  a.versions.length > 0 &&
  a.versions.every(v => /-rc\b/i.test(v));

/** "Agave upgrade" (or "Agave upgrade candidate"): an upgrade post's kind,
 *  with its client when it names only one. */
export const announcementTitle = (a: Announcement) => {
  const kind = ANNOUNCEMENT_KIND[a.kind] ?? a.kind;
  const clients = clientsOf(a);
  return a.kind === 'upgrade' && clients.length === 1
    ? `${clients[0]} upgrade${isCandidate(a) ? ' candidate' : ''}`
    : kind;
};

/**
 * Announcements from Solana Tech's announcement channels, newest first:
 * when, which cluster, what kind, and the facts read from the post (its
 * versions, epochs, SIMDs), linking the original post. Only the facts
 * are kept, never the post's text.
 */
const AnnouncementsTable = ({
  announcements,
  showCluster = true
}: {
  announcements: Announcement[];
  showCluster?: boolean;
}) => (
  <Table responsive size="sm" className="data-table compact-rows fs-9 mb-0">
    <thead>
      <tr>
        <th>Posted</th>
        {showCluster && <th>Cluster</th>}
        <th>Kind</th>
        <th>Says</th>
        <th className="text-end">Post</th>
      </tr>
    </thead>
    <tbody>
      {announcements.map(a => (
        <tr key={`${a.cluster}-${a.id}`}>
          <td className="text-nowrap text-body-tertiary">
            {postedWhen(a.postedAt)}
          </td>
          {showCluster && (
            <td className="text-nowrap">{clusterLabel(a.cluster)}</td>
          )}
          <td className="text-nowrap">
            {announcementTitle(a)}
            {a.urgent && (
              <Badge bg="danger" className="ms-2">
                Urgent
              </Badge>
            )}
          </td>
          <td className="text-body-secondary">
            {[
              a.restart?.lastConfirmedSlot != null &&
                `halted chain's last confirmed slot ${a.restart.lastConfirmedSlot.toLocaleString()}`,
              (a.versions.length > 0 || a.minVersions.length > 0) &&
                versionsText(a),
              isCandidate(a) &&
                'release candidate: for some of the stake, not all',
              a.epochs.length > 0 &&
                `epoch ${a.epochs.map(e => e.toLocaleString()).join(', ')}`
            ]
              .filter(Boolean)
              .join(' · ') || '—'}
            {a.simds.length > 0 && (
              <>
                {' · '}
                {a.simds.map((n, i) => (
                  <span key={n}>
                    {i > 0 && ', '}
                    <Link to={`/simd/${n}`}>{simdLabel(n)}</Link>
                  </span>
                ))}
              </>
            )}
          </td>
          <td className="text-end text-nowrap">
            {a.url ? (
              <a href={a.url} target="_blank" rel="noreferrer">
                Discord <FeatherIcon icon="arrow-up-right" size={11} />
              </a>
            ) : (
              '—'
            )}
          </td>
        </tr>
      ))}
    </tbody>
  </Table>
);

export default AnnouncementsTable;

/** "Restart · 4.4.0-beta.1, 26.10.4": what a post is, in a line. */
const summary = (a: Announcement) =>
  [
    a.restart?.lastConfirmedSlot != null &&
      `last confirmed slot ${a.restart.lastConfirmedSlot.toLocaleString()}`,
    (a.versions.length > 0 || a.minVersions.length > 0) && versionsText(a),
    isCandidate(a) && 'release candidate: for some of the stake, not all',
    a.epochs.length > 0 &&
      `epoch ${a.epochs.map(e => e.toLocaleString()).join(', ')}`
  ]
    .filter(Boolean)
    .join(' · ');

/** The latest announcements as a short list: kind, when, what it says,
 *  linking the post. */
export const AnnouncementList = ({
  announcements
}: {
  announcements: Announcement[];
}) => (
  <ul className="list-unstyled mb-0 d-flex flex-column gap-2 fs-9">
    {announcements.map(a => (
      <li key={`${a.cluster}-${a.id}`}>
        <div className="d-flex align-items-baseline gap-2">
          {a.url ? (
            <a
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="fw-semibold"
            >
              {announcementTitle(a)}
            </a>
          ) : (
            <span className="fw-semibold">{announcementTitle(a)}</span>
          )}
          {a.urgent && <Badge bg="danger">Urgent</Badge>}
          <span className="text-body-tertiary fs-10 ms-auto text-nowrap">
            {postedWhen(a.postedAt)}
          </span>
        </div>
        {summary(a) && (
          <div className="text-body-tertiary fs-10">{summary(a)}</div>
        )}
      </li>
    ))}
  </ul>
);
