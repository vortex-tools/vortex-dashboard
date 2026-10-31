import ApiStatusBanner from 'components/common/ApiStatusBanner';
import ClusterHaltBanner from 'components/common/ClusterHaltBanner';
import Footer from 'components/layout/Footer';
import Sidebar from 'components/layout/Sidebar';
import TopBar from 'components/layout/TopBar';
import { useAppContext } from 'providers/AppProvider';
import DelayedSpinner from 'components/common/DelayedSpinner';
import { Suspense } from 'react';
import { Outlet } from 'react-router';

/** The app shell around every dashboard page. */
const MainLayout = () => {
  const { sidebarCollapsed } = useAppContext().config;
  return (
    <div className={`vx-shell${sidebarCollapsed ? ' is-rail' : ''}`}>
      <TopBar />
      <Sidebar />
      <main className="content">
        <ApiStatusBanner />
        <ClusterHaltBanner />
        {/* A page's chunk on its first visit: the page's room held (so
            the footer doesn't jump up and back), a spinner if it's slow. */}
        <Suspense
          fallback={
            <div style={{ minHeight: '70vh' }} className="pt-4">
              <DelayedSpinner loading label="Loading…" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
        <Footer />
      </main>
    </div>
  );
};

export default MainLayout;
