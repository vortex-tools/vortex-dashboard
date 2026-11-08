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
    // The Fees tab (block-income and income redirect to it).
    fees: { rows: SKELETON.fees },
    'block-income': { rows: SKELETON.fees },
    income: { rows: SKELETON.fees },
    staking: { rows: SKELETON.staking }
  };

/** Every other page's layout while its chunk loads, by path (the first
 *  match): its title bar, then its rows. */
const PAGE: Array<[RegExp, SkeletonRow[], number?]> = [
  [/^\/leaderboards\/voting\/?$/, SKELETON.votingLeaderboard],
  [
    /^\/leaderboards\/(producers|consensus.*[?&]view=produc)/,
    SKELETON.producers
  ],
  [/^\/leaderboards\/(?!voting\/compare)/, SKELETON.leaderboard],
  [/^\/validators\/?$/, SKELETON.validators],
  // The live bar above (the page draws it with the rest).
  [/^\/status/, [{ liveBar: true }, ...SKELETON.status]],
  [/^\/slot\//, SKELETON.slot],
  [/^\/decentralization/, SKELETON.decentralization],
  [/^\/(client-versions|cluster-health)/, SKELETON.clientVersions],
  [/^\/features\/?$/, SKELETON.featureGates],
  [/^\/feature\//, SKELETON.featureGate],
  [/^\/simds\/?$/, SKELETON.simds],
  [/^\/simd\//, SKELETON.simd],
  [/^\/pools\/?$/, SKELETON.pools],
  [/^\/pool\/SFDP\/?$/i, SKELETON.poolSfdp, 3],
  [/^\/pool\//, SKELETON.pool, 3],
  [/^\/governance\/?$/, SKELETON.governance],
  [/^\/governance\//, SKELETON.proposal],
  [/^\/(activity|vote-account-changes)/, SKELETON.activity]
];

/** The page's stand-in while its chunk loads: a validator tab in its own
 *  shape, tab bar included; another page in its own (PAGE), else a
 *  generic one. */
const ChunkFallback = () => {
  const { pathname, search } = useLocation();
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
        (() => {
          const [, rows, lines] = PAGE.find(([re]) =>
            re.test(pathname + search)
          ) ?? [null, SKELETON.page];
          return <PageSkeleton header headerLines={lines} rows={rows} />;
        })()
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
