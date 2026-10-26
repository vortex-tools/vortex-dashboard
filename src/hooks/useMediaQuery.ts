import { useSyncExternalStore } from 'react';

/** Whether a CSS media query matches now, updating when it changes. */
const useMediaQuery = (query: string) =>
  useSyncExternalStore(
    onChange => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches
  );

export default useMediaQuery;
