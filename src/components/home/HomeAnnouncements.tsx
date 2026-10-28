import SectionCard from 'components/common/SectionCard';
import { AnnouncementList } from 'components/features/announcements';
import useAnnouncements from 'hooks/useAnnouncements';
import useCluster from 'hooks/useCluster';
import { useClusterHalt } from 'hooks/useIngestion';
import { FEATURES_KEY, VortexDataContext } from 'providers/VortexDataProvider';
import { Announcement } from 'providers/vortex-schemas';
import { useContext, useEffect, useMemo } from 'react';

const SHOWN = 3;

/**
 * The served cluster's announcements that call for something now, from
 * Solana Tech's channel (all of them are on Cluster Status):
 *
 * - a feature activation whose gate is queued for the next epoch boundary
 *   or activated this epoch here (by the epochs it names, for a post
 *   naming no gate): not one merely scheduled;
 * - a restart not yet finished, while the cluster is halted or posted
 *   this epoch;
 * - an upgrade or downgrade (any client's, urgent or not) posted this
 *   epoch or the last.
 *
 * Nothing while none does.
 */
const HomeAnnouncements = () => {
  const context = useContext(VortexDataContext);
  const announcements = useAnnouncements();
  const { cluster } = useCluster();
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
  const hasFeaturePosts = !!announcements?.some(a => a.kind === 'feature');
  useEffect(() => {
    if (hasFeaturePosts) fetchFeatures?.(FEATURES_KEY);
  }, [hasFeaturePosts, fetchFeatures]);
  const features = context?.featuresState.data.get(FEATURES_KEY)?.features;

  const actionable = useMemo(() => {
    if (!announcements || !cluster || epoch == null) return [];
    const byId = new Map((features ?? []).map(f => [f.id, f]));
    const postedThisEpoch = (a: Announcement) =>
      epochStartedAt != null && a.postedAt >= epochStartedAt;
    const postedSinceLastEpoch = (a: Announcement) =>
      epochStartedAt != null &&
      epochSecs != null &&
      a.postedAt >= epochStartedAt - epochSecs;
    return announcements.filter(a => {
      // A restart the cluster has finished is history, halt or not.
      if (a.kind === 'restart')
        return a.restart?.finished !== true && (!!halt || postedThisEpoch(a));
      if (a.kind === 'upgrade' || a.kind === 'downgrade')
        return postedSinceLastEpoch(a);
      if (a.kind !== 'feature') return false;
      if (a.featureIds.length)
        return a.featureIds.some(id => {
          const s = byId.get(id)?.clusters[cluster];
          return (
            s?.status === 'queued' ||
            (s?.status === 'active' && s.epoch === epoch)
          );
        });
      return a.epochs.some(e => e === epoch || e === epoch + 1);
    });
  }, [
    announcements,
    cluster,
    epoch,
    features,
    halt,
    epochStartedAt,
    epochSecs
  ]);

  if (!actionable.length) return null;
  return (
    <div className="mb-3">
      <SectionCard
        title="Announcements"
        icon="volume-2"
        info="Announcements that matter now: a client upgrade, a feature activating, a restart. All of them are on Cluster Status."
      >
        <AnnouncementList announcements={actionable.slice(0, SHOWN)} />
      </SectionCard>
    </div>
  );
};

export default HomeAnnouncements;
