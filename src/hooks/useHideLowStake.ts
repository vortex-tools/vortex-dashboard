import { useCallback, useState } from 'react';

const KEY = 'vx-hide-low-stake';

/**
 * The consensus leaderboards' "Hide low stake" switch, remembered per
 * browser (off by default). Storage may be blocked - then it's per page
 * view.
 */
const useHideLowStake = (): [boolean, (v: boolean) => void] => {
  const [hide, setHide] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  const set = useCallback((v: boolean) => {
    setHide(v);
    try {
      localStorage.setItem(KEY, v ? '1' : '0');
    } catch {
      // per page view only
    }
  }, []);
  return [hide, set];
};

export default useHideLowStake;
