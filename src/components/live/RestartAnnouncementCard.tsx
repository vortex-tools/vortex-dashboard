import FeatherIcon from 'feather-icons-react';
import SectionCard from 'components/common/SectionCard';
import { postedWhen } from 'components/features/announcements';
import { Announcement } from 'providers/vortex-schemas';
import { ReactNode } from 'react';
import { Link } from 'react-router';

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <>
    <dt className="col-sm-4 fw-normal text-body-tertiary">{label}</dt>
    <dd className="col-sm-8 mb-0">{children}</dd>
  </>
);

const slotLink = (s: number) => (
  <Link to={`/slot/${s}`} className="font-monospace">
    {s.toLocaleString()}
  </Link>
);

/** "the Agave wiki page" for an Agave wiki URL, else its host. */
const pageName = (url: string) => {
  if (/github\.com\/anza-xyz\/agave\/wiki\//.test(url))
    return 'the Agave wiki page';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * While halted: the restart Solana Tech announced for this halt - when it
 * was posted, the restart parameters (the halted chain's last confirmed
 * slot, the restart snapshot's slot, hard fork, expected bank hash and
 * shred version), the versions to run, and where each fact was read: the
 * post, and the Agave wiki pages it links. Parsed from free text, so it
 * says to check the sources before acting.
 */
const RestartAnnouncementCard = ({ post }: { post: Announcement }) => {
  const r = post.restart;
  const restartSlot = r?.waitForSupermajority ?? null;
  return (
    <SectionCard
      title="Restart Announced"
      icon="volume-2"
      info="From Solana Tech's announcement channel: only the facts read from the post and the Agave wiki pages it links (re-read every few minutes for three days, since pages get corrected). The restart slot is the restart snapshot's slot - the halted chain's last confirmed slot, or a block built on it for the restart - not where the chain halted."
    >
      <p className="fs-9 mb-3">
        Solana Tech announced a restart{' '}
        <span className="text-body-tertiary">
          {postedWhen(post.postedAt)}
          {post.editedAt && ' (edited)'}
        </span>
        .
      </p>
      {r && (
        <dl className="row fs-9 gy-1 mb-3">
          {r.lastConfirmedSlot != null && (
            <Row label="Halted chain's last confirmed slot">
              {slotLink(r.lastConfirmedSlot)}
            </Row>
          )}
          {restartSlot != null && (
            <Row label="Restart slot (wait for supermajority)">
              {slotLink(restartSlot)}
              {r.lastConfirmedSlot != null &&
                restartSlot !== r.lastConfirmedSlot && (
                  <span className="text-body-tertiary">
                    {' '}
                    · a block built on the last confirmed slot
                  </span>
                )}
            </Row>
          )}
          {r.hardFork != null && r.hardFork !== restartSlot && (
            <Row label="Hard fork">{slotLink(r.hardFork)}</Row>
          )}
          {r.expectedBankHash && (
            <Row label="Expected bank hash">
              <span className="font-monospace text-break">
                {r.expectedBankHash}
              </span>
            </Row>
          )}
          {r.expectedShredVersion != null && (
            <Row label="New shred version">
              <span className="font-monospace">{r.expectedShredVersion}</span>
            </Row>
          )}
          {(post.minVersions.length > 0 || post.versions.length > 0) && (
            <Row label="Versions">
              <span className="font-monospace">
                {(post.minVersions.length ? post.minVersions : post.versions)
                  .map(v => v.replace(/^v/, ''))
                  .join(', ')}
              </span>
              {post.minVersions.length > 0 && (
                <span className="text-body-tertiary"> or later</span>
              )}
            </Row>
          )}
        </dl>
      )}
      <p className="fs-10 text-body-tertiary mb-0">
        Read from{' '}
        {post.url ? (
          <a href={post.url} target="_blank" rel="noreferrer">
            the post <FeatherIcon icon="arrow-up-right" size={10} />
          </a>
        ) : (
          'the post'
        )}
        {post.linked.map(l => (
          <span key={l.url}>
            {' and '}
            <a href={l.url} target="_blank" rel="noreferrer">
              {pageName(l.url)} <FeatherIcon icon="arrow-up-right" size={10} />
            </a>
            {l.fetchedAt && ` (read ${postedWhen(l.fetchedAt)})`}
          </span>
        ))}
        . Parsed from free text: check them before acting on these.
      </p>
    </SectionCard>
  );
};

export default RestartAnnouncementCard;
