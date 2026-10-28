import useCluster from 'hooks/useCluster';
import { ClusterHalt } from 'hooks/useIngestion';
import useLiveRefresh from 'hooks/useLiveRefresh';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { Announcement } from 'providers/vortex-schemas';
import { useContext, useEffect } from 'react';

/** How far a post's last confirmed slot may sit from the halt's last
 *  rooted slot and still be about this halt. */
const SLOT_SLACK = 5_000;
/** A restart post with no slot yet counts if posted this long before the
 *  halt or after it. */
const POSTED_SLACK_S = 3_600;
const REFRESH_MS = 60_000;

/**
 * The restart announcement for the current halt, if Solana Tech's
 * channel has posted one: the newest restart post whose halted chain's
 * last confirmed slot is near the halt's last slot, else (a post that
 * names no slot) the newest restart posted since the halt. Re-read every
 * minute while halted, since the post (and the wiki page it links)
 * often comes after the halt. Nothing about any particular halt is
 * assumed.
 */
const useRestartAnnouncement = (
  halt: ClusterHalt | null
): Announcement | null => {
  const context = useContext(VortexDataContext);
  const { cluster } = useCluster();
  const fetchData = context?.announcementsState.fetchData;
  const halted = !!halt && !!cluster;
  useEffect(() => {
    if (halted && cluster) fetchData?.(cluster);
  }, [halted, cluster, fetchData]);
  useLiveRefresh(halted, REFRESH_MS, () => {
    if (cluster) fetchData?.(cluster, { force: true });
  });
  if (!halt || !cluster) return null;
  const posts = (
    context?.announcementsState.data.get(cluster)?.announcements ?? []
  ).filter(
    // Not one the cluster has already finished (an earlier restart).
    a =>
      a.kind === 'restart' &&
      a.cluster === cluster &&
      a.restart?.finished !== true
  );
  const bySlot = posts.find(a => {
    const s = a.restart?.lastConfirmedSlot;
    return s != null && Math.abs(s - halt.slot) <= SLOT_SLACK;
  });
  if (bySlot) return bySlot;
  return (
    posts.find(
      a =>
        a.restart?.lastConfirmedSlot == null &&
        a.postedAt >= halt.since - POSTED_SLACK_S
    ) ?? null
  );
};

export default useRestartAnnouncement;
