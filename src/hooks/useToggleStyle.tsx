import { getSystemTheme } from 'helpers/utils';
import { useAppContext } from 'providers/AppProvider';
import { useEffect } from 'react';

/** Keeps <html data-bs-theme> on the picked theme ('auto': the system's). */
const useToggleStyle = () => {
  const { theme } = useAppContext().config;
  useEffect(() => {
    document.documentElement.setAttribute(
      'data-bs-theme',
      theme === 'auto' ? getSystemTheme() : theme
    );
  }, [theme]);
};

export default useToggleStyle;
