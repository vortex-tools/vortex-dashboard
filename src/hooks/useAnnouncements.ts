import useCluster from 'hooks/useCluster';
import useLiveRefresh from 'hooks/useLiveRefresh';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { Announcement } from 'providers/vortex-schemas';
import { useContext, useEffect, useMemo } from 'react';

const REFRESH_MS = 5 * 60_000;

/** Both clusters' posts, in one read that needn't wait for
 *  /epochs/current to say which cluster this is. */
export const ALL_ANNOUNCEMENTS = '';

/**
 * The served cluster's announcements from Solana Tech's channel
 * (/announcements), newest first; re-read every five minutes. Read for
 * both clusters at once (so the request starts with the page's first
 * ones) and filtered once the cluster is known. Undefined until both are
 * (or on an API without them).
 */
const useAnnouncements = (): Announcement[] | undefined => {
  const context = useContext(VortexDataContext);
  const { cluster } = useCluster();
  const fetchData = context?.announcementsState.fetchData;
  useEffect(() => {
    fetchData?.(ALL_ANNOUNCEMENTS);
  }, [fetchData]);
  useLiveRefresh(true, REFRESH_MS, () => {
    fetchData?.(ALL_ANNOUNCEMENTS, { force: true });
  });
  const all =
    context?.announcementsState.data.get(ALL_ANNOUNCEMENTS)?.announcements;
  return useMemo(
    () => (cluster && all ? all.filter(a => a.cluster === cluster) : undefined),
    [cluster, all]
  );
};

export default useAnnouncements;
