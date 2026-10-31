import usePageMeta from 'hooks/usePageMeta';
import useToggleStyle from 'hooks/useToggleStyle';
import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';

const App = () => {
  useToggleStyle();
  usePageMeta();
  const { pathname } = useLocation();

  // Scroll to top whenever the route changes - except stepping from slot
  // to slot, which swaps the content in place.
  const prevPath = useRef(pathname);
  useEffect(() => {
    const isSlot = (p: string) => p.startsWith('/slot/');
    if (!(isSlot(prevPath.current) && isSlot(pathname))) window.scrollTo(0, 0);
    prevPath.current = pathname;
  }, [pathname]);

  return <Outlet />;
};

export default App;
