import SectionCard from 'components/common/SectionCard';
import { AnnouncementList } from 'components/features/announcements';
import useAnnouncements from 'hooks/useAnnouncements';

const SHOWN = 3;

/** The served cluster's latest announcements (restarts, upgrades, feature
 *  activations) from Solana Tech's channel; all of them on Cluster
 *  Status. Nothing while there are none. */
const HomeAnnouncements = () => {
  const announcements = useAnnouncements();
  if (!announcements?.length) return null;
  return (
    <SectionCard
      title="Announcements"
      icon="volume-2"
      linkTo="/status"
      linkLabel="All"
      info="From Solana Tech's announcement channel: only the facts read from each post (linked) are kept."
    >
      <AnnouncementList announcements={announcements.slice(0, SHOWN)} />
    </SectionCard>
  );
};

export default HomeAnnouncements;
