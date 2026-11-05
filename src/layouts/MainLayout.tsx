import ApiStatusBanner from 'components/common/ApiStatusBanner';
import ClusterHaltBanner from 'components/common/ClusterHaltBanner';
import Footer from 'components/layout/Footer';
import Sidebar from 'components/layout/Sidebar';
import NavProgress from 'components/layout/NavProgress';
import TopBar from 'components/layout/TopBar';
import { useAppContext } from 'providers/AppProvider';
import PageSkeleton, {
  SKELETON,
  SkeletonRow,
  ValidatorHeaderSkeleton
} from 'components/common/PageSkeleton';
import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';

/** A validator tab's layout while its chunk loads, from the path's tab
 *  (the consensus tabs with their epoch picker). */
const VALIDATOR_TAB: Record<string, { rows: SkeletonRow[]; picker?: boolean }> =
  {
    '': { rows: SKELETON.overview },
    voting: {
      rows: [{ live: true }, { stats: 4 }, ...SKELETON.votingCards],
      picker: true
    },
    production: { rows: SKELETON.production, picker: true },
    network: { rows: SKELETON.network, picker: true },
    earnings: { rows: SKELETON.earnings },
    'block-income': { rows: SKELETON.fees },
    staking: { rows: SKELETON.staking }
  };

/** The page's stand-in while its chunk loads: a validator tab in its own
 *  shape, tab bar included; any other page a generic one. */
const ChunkFallback = () => {
  const { pathname } = useLocation();
  const m = pathname.match(/^\/validator\/[^/]+(?:\/([^/]+))?/);
  const tab = m ? VALIDATOR_TAB[m[1] ?? ''] : undefined;
  return (
    <div style={{ minHeight: '100vh' }}>
      {tab ? (
        <>
          <ValidatorHeaderSkeleton picker={tab.picker} />
          <PageSkeleton rows={tab.rows} />
        </>
      ) : (
        <PageSkeleton header rows={SKELETON.page} />
      )}
    </div>
  );
};

/** The app shell around every dashboard page. */
const MainLayout = () => {
  const { sidebarCollapsed } = useAppContext().config;
  return (
    <div className={`vx-shell${sidebarCollapsed ? ' is-rail' : ''}`}>
      <TopBar />
      <NavProgress />
      <Sidebar />
      <main className="content">
        <ApiStatusBanner />
        <ClusterHaltBanner />
        {/* A page's chunk on its first visit: a screen's height held, so
            the footer starts below the fold and doesn't jump when the page
            arrives (a spinner if it's slow). */}
        <Suspense fallback={<ChunkFallback />}>
          <Outlet />
        </Suspense>
        <Footer />
      </main>
    </div>
  );
};

export default MainLayout;
