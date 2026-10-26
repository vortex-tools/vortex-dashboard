import { ThemeVariant } from 'config';
import { readStored, writeStored } from 'helpers/storage';
import { getColor, getSystemTheme } from 'helpers/utils';
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';

interface AppState {
  /** What's stored: theme picked, and whether the sidebar is an icon rail. */
  config: {
    theme: ThemeVariant;
    sidebarCollapsed: boolean;
    /** Below lg: the sidebar dropped down from the top bar. */
    sidebarOpen: boolean;
  };
  /** The theme in effect ('auto' resolved). */
  isDark: boolean;
  setTheme: (theme: ThemeVariant) => void;
  toggleTheme: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  /** A theme color (`--vx-<name>`), for charts. */
  getThemeColor: (name: string) => string;
}

const AppContext = createContext<AppState | null>(null);

const applyTheme = (mode: 'light' | 'dark') =>
  document.documentElement.setAttribute('data-bs-theme', mode);

/**
 * App-wide UI state: the color theme (stored; 'auto' follows the system
 * live) and the sidebar (collapsed state stored, the mobile drop-down
 * not). The theme is applied to <html data-bs-theme> before the state
 * changes, so charts that read CSS variables while re-rendering get the
 * new colors.
 */
const AppProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeVariant>(() =>
    readStored<ThemeVariant>('theme', 'light')
  );
  const [system, setSystem] = useState(getSystemTheme);
  const [sidebarCollapsed, setCollapsedState] = useState(() =>
    readStored('sidebarCollapsed', false)
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = mq.matches ? 'dark' : 'light';
      if (theme === 'auto') applyTheme(next);
      setSystem(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const isDark = theme === 'dark' || (theme === 'auto' && system === 'dark');

  const setTheme = useCallback((next: ThemeVariant) => {
    applyTheme(next === 'auto' ? getSystemTheme() : next);
    writeStored('theme', next);
    setThemeState(next);
  }, []);
  const toggleTheme = useCallback(
    () => setTheme(isDark ? 'light' : 'dark'),
    [isDark, setTheme]
  );
  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    writeStored('sidebarCollapsed', collapsed);
    setCollapsedState(collapsed);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      config: { theme, sidebarCollapsed, sidebarOpen },
      isDark,
      setTheme,
      toggleTheme,
      setSidebarCollapsed,
      setSidebarOpen,
      getThemeColor: getColor
    }),
    [
      theme,
      sidebarCollapsed,
      sidebarOpen,
      isDark,
      setTheme,
      toggleTheme,
      setSidebarCollapsed
    ]
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const app = useContext(AppContext);
  if (!app) throw new Error('useAppContext outside AppProvider');
  return app;
};

export default AppProvider;
