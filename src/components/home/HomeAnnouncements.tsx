import Badge from 'components/base/Badge';
import SectionCard from 'components/common/SectionCard';
import {
  announcementTitle,
  postedWhen,
  summary
} from 'components/features/announcements';
import { featureName } from 'components/features/features';
import { proposalName } from 'components/governance/governance';
import useAnnouncements from 'hooks/useAnnouncements';
import useCluster from 'hooks/useCluster';
import { useClusterHalt } from 'hooks/useIngestion';
import {
  FEATURES_KEY,
  GOVERNANCE_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';
import { Announcement } from 'providers/vortex-schemas';
import { ReactNode, useContext, useEffect, useMemo } from 'react';
import { Link } from 'react-router';

const SHOWN = 3;

/** One line of the card: what it is, where it links, why it's here. */
type Item = {
  key: string;
  /** Lower first: a restart, an urgent upgrade, a feature gate
   *  activating, a governance vote, any other upgrade. */
  priority: number;
  title: string;
  /** An internal path, or the post (external). */
  to: string;
  external?: boolean;
  urgent?: boolean;
  /** Unix s, for the right-hand date (and ordering within a priority). */
  at: number | null;
  detail: ReactNode;
};

/**
 * What matters on the served cluster now, most pressing first, at most
 * SHOWN:
 *
 * 1. a restart post while the cluster is halted (or posted this epoch,
 *    not yet finished);
 * 2. an urgent upgrade or downgrade posted this epoch or the last;
 * 3. a feature gate activating at the next epoch boundary, or activated
 *    this epoch (from the gates themselves, so it shows with or without
 *    a post);
 * 4. a governance vote in progress;
 * 5. any other upgrade or downgrade posted this epoch or the last.
 *
 * Nothing while none does.
 */
const HomeAnnouncements = () => {
  const context = useContext(VortexDataContext);
  const announcements = useAnnouncements();
  const { cluster, isTestnet } = useCluster();
  const halt = useClusterHalt();
  const epoch = context?.currentEpochState.epoch ?? null;
  const progress = context?.currentEpochState.progress;
  // When this epoch began (unix s), from its elapsed slots.
  const epochStartedAt =
    progress?.slotIndex != null && progress.slotSeconds
      ? Date.now() / 1000 - progress.slotIndex * progress.slotSeconds
      : null;
  const epochSecs =
    progress?.slotsInEpoch && progress.slotSeconds
      ? progress.slotsInEpoch * progress.slotSeconds
      : null;

  const fetchFeatures = context?.featuresState.fetchData;
  useEffect(() => {
    fetchFeatures?.(FEATURES_KEY);
  }, [fetchFeatures]);
  const features = context?.featuresState.data.get(FEATURES_KEY)?.features;
  // Governance is mainnet's (testnet has none).
  const fetchProposals = context?.governanceProposalsState.fetchData;
  useEffect(() => {
    if (!isTestnet) fetchProposals?.(GOVERNANCE_KEY);
  }, [isTestnet, fetchProposals]);
  const proposals =
    context?.governanceProposalsState.data.get(GOVERNANCE_KEY)?.proposals;

  const items = useMemo(() => {
    if (!cluster || epoch == null) return [];
    const postedThisEpoch = (a: Announcement) =>
      epochStartedAt != null && a.postedAt >= epochStartedAt;
    const postedSinceLastEpoch = (a: Announcement) =>
      epochStartedAt != null &&
      epochSecs != null &&
      a.postedAt >= epochStartedAt - epochSecs;
    const post = (a: Announcement, priority: number): Item => ({
      key: `post-${a.id}`,
      priority,
      title: announcementTitle(a),
      to: a.url ?? '/status',
      external: !!a.url,
      urgent: a.urgent,
      at: a.postedAt,
      detail: summary(a)
    });
    const out: Item[] = [];
    for (const a of announcements ?? []) {
      if (a.cluster !== cluster) continue;
      // A restart the cluster has finished is history, halt or not.
      if (a.kind === 'restart') {
        if (a.restart?.finished !== true && (!!halt || postedThisEpoch(a)))
          out.push(post(a, 0));
      } else if (a.kind === 'upgrade' || a.kind === 'downgrade') {
        if (postedSinceLastEpoch(a)) out.push(post(a, a.urgent ? 1 : 4));
      }
    }
    // Feature gates queued for the next boundary or activated this epoch.
    for (const f of features ?? []) {
      const s = f.clusters[cluster];
      const queued = s?.status === 'queued';
      const activated = s?.status === 'active' && s.epoch === epoch;
      if (!queued && !activated) continue;
      out.push({
        key: `gate-${f.id}`,
        priority: 2,
        title: queued
          ? 'Feature gate activating'
          : 'Feature gate activated this epoch',
        to: `/feature/${f.id}`,
        at: null,
        detail: queued
          ? `${featureName(f)} · at the epoch ${(epoch + 1).toLocaleString()} boundary`
          : featureName(f)
      });
    }
    // Governance votes open now.
    for (const p of proposals ?? []) {
      if (p.phase !== 'voting') continue;
      out.push({
        key: `gov-${p.address}`,
        priority: 3,
        title: 'Governance vote open',
        to: `/governance/${p.address}`,
        at: null,
        detail: `${proposalName(p)}${p.endEpoch != null ? ` · closes epoch ${p.endEpoch.toLocaleString()}` : ''}`
      });
    }
    return out.sort(
      (a, b) => a.priority - b.priority || (b.at ?? 0) - (a.at ?? 0)
    );
  }, [
    announcements,
    cluster,
    epoch,
    features,
    proposals,
    halt,
    epochStartedAt,
    epochSecs
  ]);

  if (!items.length) return null;
  return (
    <div className="mb-3">
      <SectionCard
        title="Announcements"
        icon="volume-2"
        info="What matters now, most pressing first: a restart, an urgent upgrade, a feature gate activating, a governance vote, a client upgrade. Every post is on Cluster Status."
      >
        <ul className="list-unstyled mb-0 d-flex flex-column gap-2 fs-9">
          {items.slice(0, SHOWN).map(it => (
            <li key={it.key}>
              <div className="d-flex align-items-baseline gap-2">
                {it.external ? (
                  <a
                    href={it.to}
                    target="_blank"
                    rel="noreferrer"
                    className="fw-semibold"
                  >
                    {it.title}
                  </a>
                ) : (
                  <Link to={it.to} className="fw-semibold">
                    {it.title}
                  </Link>
                )}
                {it.urgent && <Badge bg="danger">Urgent</Badge>}
                {it.at != null && (
                  <span className="text-body-tertiary fs-10 ms-auto text-nowrap">
                    {postedWhen(it.at)}
                  </span>
                )}
              </div>
              {it.detail && (
                <div className="text-body-tertiary fs-10">{it.detail}</div>
              )}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
};

export default HomeAnnouncements;
