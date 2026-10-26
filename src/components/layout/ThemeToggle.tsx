import FeatherIcon from 'feather-icons-react';
import { useAppContext } from 'providers/AppProvider';

/** The top bar's light / dark switch: shows the theme in effect. */
const ThemeToggle = () => {
  const { isDark, toggleTheme } = useAppContext();
  return (
    <button
      type="button"
      className="topbar-pill"
      onClick={toggleTheme}
      title={isDark ? 'Switch to the light theme' : 'Switch to the dark theme'}
    >
      <FeatherIcon
        icon={isDark ? 'moon' : 'sun'}
        size={10}
        className="d-none d-sm-block"
      />
      {isDark ? 'Dark' : 'Light'}
    </button>
  );
};

export default ThemeToggle;
