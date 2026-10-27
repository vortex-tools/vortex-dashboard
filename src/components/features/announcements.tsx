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

/** "Agave 4.4.0-beta.1 · 26.10.4": versions as the post lists them. */
const versionsText = (a: Announcement) =>
  a.minVersions.length
    ? `at least ${a.minVersions.join(', ')}`
    : a.versions.join(', ');

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
            {ANNOUNCEMENT_KIND[a.kind] ?? a.kind}
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
              {ANNOUNCEMENT_KIND[a.kind] ?? a.kind}
            </a>
          ) : (
            <span className="fw-semibold">
              {ANNOUNCEMENT_KIND[a.kind] ?? a.kind}
            </span>
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
