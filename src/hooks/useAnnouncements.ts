import useCluster from 'hooks/useCluster';
import useLiveRefresh from 'hooks/useLiveRefresh';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { Announcement } from 'providers/vortex-schemas';
import { useContext, useEffect } from 'react';

const REFRESH_MS = 5 * 60_000;

/**
 * The served cluster's announcements from Solana Tech's channel
 * (/announcements), newest first; re-read every five minutes. Undefined
 * until loaded (or on an API without them).
 */
const useAnnouncements = (): Announcement[] | undefined => {
  const context = useContext(VortexDataContext);
  const { cluster } = useCluster();
  const fetchData = context?.announcementsState.fetchData;
  useEffect(() => {
    if (cluster) fetchData?.(cluster);
  }, [cluster, fetchData]);
  useLiveRefresh(!!cluster, REFRESH_MS, () => {
    if (cluster) fetchData?.(cluster, { force: true });
  });
  return cluster
    ? context?.announcementsState.data.get(cluster)?.announcements
    : undefined;
};

export default useAnnouncements;
