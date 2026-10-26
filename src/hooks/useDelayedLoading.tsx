import { useEffect, useRef, useState } from 'react';

// Show the loader only after `delayMs` of sustained loading — fast requests
// (<delayMs) never render a spinner at all. Once shown, keep it visible for
// at least `minMs` so it doesn't flash on completion.
const useDelayedLoading = (
  isLoading: boolean,
  delayMs = 200,
  minMs = 400
): boolean => {
  // Seed visible=true when the component mounts already loading, so no
  // delay-induced blank window on initial page load.
  const [visible, setVisible] = useState(isLoading);
  const shownAtRef = useRef<number | null>(isLoading ? Date.now() : null);

  useEffect(() => {
    if (isLoading && !visible) {
      const timer = setTimeout(() => {
        setVisible(true);
        shownAtRef.current = Date.now();
      }, delayMs);
      return () => clearTimeout(timer);
    }

    if (!isLoading && visible) {
      const elapsed = shownAtRef.current
        ? Date.now() - shownAtRef.current
        : minMs;
      const remaining = Math.max(0, minMs - elapsed);
      const timer = setTimeout(() => {
        setVisible(false);
        shownAtRef.current = null;
      }, remaining);
      return () => clearTimeout(timer);
    }
  }, [isLoading, visible, delayMs, minMs]);

  return visible;
};

export default useDelayedLoading;
