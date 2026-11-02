import { WINDOW, windowHandoff } from 'components/live/slotDots';
import { fetchSlots } from 'helpers/slotContext';
import { SlotInfo } from 'providers/vortex-schemas';
import { useEffect, useMemo, useState } from 'react';

export type WindowHandoffs = {
  /** From the previous leader to it; null: not measured (a clamped time,
   *  not in yet), or it led the window before too. */
  in: { ms: number; skipped: boolean } | null;
  /** From it to the next leader. */
  out: { ms: number; skipped: boolean } | null;
  /** It leads the window before / after too: no handoff that side. */
  sameIn: boolean;
  sameOut: boolean;
};

/**
 * Its leader windows' handoffs both ways, by the producers' block times
 * (as Cluster Status's Recent Leaders): the window before's last block to
 * its first, its last to the next window's first. One /slots list request
 * for the windows given (12 slots each), cached as slots are.
 */
const useWindowHandoffs = (firstSlots: number[]) => {
  const [infos, setInfos] = useState<Map<number, SlotInfo | null>>(
    () => new Map()
  );
  // By value: a new array of the same windows doesn't refetch.
  const key = firstSlots.join(',');
  const firsts = useMemo(() => (key ? key.split(',').map(Number) : []), [key]);
  useEffect(() => {
    if (!firsts.length) return;
    let live = true;
    const slots = firsts.flatMap(f =>
      Array.from({ length: 3 * WINDOW }, (_, k) => f - WINDOW + k)
    );
    fetchSlots(slots)
      .then(m => {
        if (live) setInfos(prev => new Map([...prev, ...m]));
      })
      .catch(() => {
        // Not measured: the cells stay blank.
      });
    return () => {
      live = false;
    };
  }, [firsts]);
  const leaderOf = (first: number) =>
    Array.from({ length: WINDOW }, (_, k) => infos.get(first + k)?.leader).find(
      l => l != null
    );
  return (first: number): WindowHandoffs => {
    const me = leaderOf(first);
    const sameIn = !!me && leaderOf(first - WINDOW) === me;
    const sameOut = !!me && leaderOf(first + WINDOW) === me;
    const h = (f: number) => {
      const x = windowHandoff(f, infos);
      return x ? { ms: x.ms, skipped: x.afterSkip || x.beforeSkip } : null;
    };
    return {
      in: sameIn ? null : h(first),
      out: sameOut ? null : h(first + WINDOW),
      sameIn,
      sameOut
    };
  };
};

export default useWindowHandoffs;
