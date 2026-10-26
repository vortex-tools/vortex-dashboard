import ApiStatusBanner from 'components/common/ApiStatusBanner';
import Footer from 'components/layout/Footer';
import Sidebar from 'components/layout/Sidebar';
import TopBar from 'components/layout/TopBar';
import { useAppContext } from 'providers/AppProvider';
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
        <Outlet />
        <Footer />
      </main>
    </div>
  );
};

export default MainLayout;
