import { useSyncExternalStore } from 'react';

/**
 * The slot Home's live slot strip is at, shared with the Current Slot card
 * so the two show the same number (the strip replays a few seconds behind
 * the chain). null until the strip reports one.
 */
let slot: number | null = null;
const listeners = new Set<() => void>();

export const setLiveSlot = (s: number) => {
  if (s === slot) return;
  slot = s;
  for (const l of listeners) l();
};

const useLiveSlot = () =>
  useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => slot
  );

export default useLiveSlot;
