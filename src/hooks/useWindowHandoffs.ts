import {
  WINDOW,
  handoffClamped,
  windowHandoff
} from 'components/live/slotDots';
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
  /** Each of its 4 slots' time: from the block before it to its own, by
   *  the producers' block times - the first slot's is the handoff to it
   *  (unless it led the window before). `skipped`: the gap spans a skipped
   *  slot. state: no block (skip), a clamped block time (clamped), or not
   *  in yet (pending). */
  slots: Array<{
    ms: number | null;
    skipped: boolean;
    state: 'timed' | 'skip' | 'clamped' | 'pending';
  }>;
};

/**
 * Its leader windows' handoffs both ways, by the producers' block times
 * (as Cluster Status's Recent Leaders): the window before's last block to
 * its first, its last to the next window's first. One /slots list request
 * for the windows given (12 slots each), cached as slots are.
 */
const useWindowHandoffs = (
  firstSlots: number[],
  /** Slots it has from elsewhere, newer (the live windows' poller). */
  live?: Map<number, SlotInfo | null>,
  /** The live slot: windows it hasn't passed are re-read as it moves
   *  (every few slots), so a playing window's neighbours fill in. */
  slotNow = 0
) => {
  const [infos, setInfos] = useState<Map<number, SlotInfo | null>>(
    () => new Map()
  );
  // By value: a new array of the same windows doesn't refetch.
  // A window played in the last ~20 s is re-read every 8 slots, so its
  // neighbours' blocks fill in once ingested (which can lag the chain by
  // seconds); settled slots come from fetchSlots' cache, so only the
  // newest are asked for.
  const tick = Math.floor(slotNow / 8);
  const fresh = firstSlots.some(f => slotNow && f + 100 > slotNow);
  const key = `${firstSlots.join(',')}${fresh ? `@${tick}` : ''}`;
  const firsts = useMemo(
    () => (key ? key.split('@')[0].split(',').filter(Boolean).map(Number) : []),
    [key]
  );
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
  const all = live?.size ? new Map([...infos, ...live]) : infos;
  const leaderOf = (first: number) =>
    Array.from({ length: WINDOW }, (_, k) => all.get(first + k)?.leader).find(
      l => l != null
    );
  return (first: number): WindowHandoffs => {
    const me = leaderOf(first);
    const sameIn = !!me && leaderOf(first - WINDOW) === me;
    const sameOut = !!me && leaderOf(first + WINDOW) === me;
    const h = (f: number) => {
      const x = windowHandoff(f, all);
      return x ? { ms: x.ms, skipped: x.afterSkip || x.beforeSkip } : null;
    };
    const slots = Array.from({ length: WINDOW }, (_, k) => {
      const i = all.get(first + k);
      if (!i?.outcome || (i.outcome !== 'block' && i.outcome !== 'skipped'))
        return { ms: null, skipped: false, state: 'pending' as const };
      if (i.outcome === 'skipped')
        return { ms: null, skipped: false, state: 'skip' as const };
      if (i.footer?.clockClamp || i.footer?.producerTimeNanos == null)
        return { ms: null, skipped: false, state: 'clamped' as const };
      // From the block before it: windowHandoff from this slot's view.
      const x = windowHandoff(first + k, all);
      return x
        ? { ms: x.ms, skipped: x.beforeSkip, state: 'timed' as const }
        : handoffClamped(first + k, all)
          ? { ms: null, skipped: false, state: 'clamped' as const }
          : { ms: null, skipped: false, state: 'pending' as const };
    });
    return {
      in: sameIn ? null : h(first),
      out: sameOut ? null : h(first + WINDOW),
      sameIn,
      sameOut,
      slots
    };
  };
};

export default useWindowHandoffs;
