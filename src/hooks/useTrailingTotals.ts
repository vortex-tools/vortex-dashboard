import { useEffect, useRef, useState } from 'react';

const REVENUE_STEP_MS = 600;
// No new figure for this many refresh intervals (or a jump this many
// intervals' worth of blocks): restart rather than fast-forward.
const IDLE_INTERVALS = 3;

interface Snapshot {
  blocks: number;
  revenue: number | null;
}

/**
 * Live block count + revenue for the index cards, trailing the polled
 * totals so they never run ahead of the data:
 *
 * - Blocks count up evenly from what's on screen to each newly polled
 *   figure over `intervalMs` (the server's refresh interval). On first
 *   load they start one interval in the past (at `blocksPerSec`), so the
 *   count is moving from the start rather than waiting for the second
 *   poll.
 * - Revenue moves only when the block count reaches a figure a poll gave
 *   a revenue for: it then steps quickly to that revenue. Before the first
 *   poll's figure is reached it shows that poll's revenue (there is
 *   nothing earlier).
 *
 * A lower polled count (a new epoch) resets both.
 */
const useTrailingTotals = (
  latest: Snapshot | null,
  intervalMs: number,
  blocksPerSec: number | null
) => {
  const [shown, setShown] = useState<{
    blocks: number | null;
    revenue: number | null;
  }>({ blocks: null, revenue: null });
  const snapshots = useRef<Snapshot[]>([]);
  // Only the first load's lead-in uses the rate; a changed rate mustn't
  // restart the count.
  const rate = useRef(blocksPerSec);
  rate.current = blocksPerSec;
  const blocksRef = useRef<number | null>(null);
  // When the last polled figure arrived (for the idle restart).
  const lastAt = useRef<number | null>(null);
  const revenue = useRef<{
    from: number;
    to: number;
    start: number;
  } | null>(null);

  useEffect(() => {
    if (!latest) return;
    const snaps = snapshots.current;
    const last = snaps[snaps.length - 1];
    // Start over like a fresh page load (a short lead-in to the latest
    // figure) on a new epoch, or after an idle / hidden tab: polls pause
    // while hidden, so the next figure can be far ahead, and counting all
    // the way up to it would fast-forward through history.
    const idle =
      lastAt.current != null &&
      performance.now() - lastAt.current > IDLE_INTERVALS * intervalMs;
    const leapt =
      blocksRef.current != null &&
      rate.current != null &&
      latest.blocks - blocksRef.current >
        (IDLE_INTERVALS * rate.current * intervalMs) / 1000;
    if ((last && latest.blocks < last.blocks) || idle || leapt) {
      snaps.length = 0;
      blocksRef.current = null;
      revenue.current = null;
    }
    lastAt.current = performance.now();
    if (!last || latest.blocks !== last.blocks || snaps.length === 0)
      snaps.push(latest);
    if (snaps.length > 20) snaps.splice(0, snaps.length - 20);

    const lead = rate.current ? (rate.current * intervalMs) / 1000 : 0;
    const from = blocksRef.current ?? Math.max(0, latest.blocks - lead);
    const to = Math.max(from, latest.blocks);
    const start = performance.now();
    let raf = 0;

    const revenueAt = (blocks: number) => {
      let r: number | null = snaps[0]?.revenue ?? null;
      for (const s of snaps) if (s.blocks <= blocks) r = s.revenue;
      return r;
    };

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / intervalMs);
      const blocks = Math.floor(from + (to - from) * t);
      blocksRef.current = blocks;

      // Revenue: step quickly to the figure for the latest block count
      // reached.
      const target = revenueAt(blocks);
      let rev: number | null = target;
      if (target != null) {
        const r = revenue.current;
        if (!r) revenue.current = { from: target, to: target, start: now };
        else if (r.to !== target)
          revenue.current = {
            from: currentRevenue(r, now),
            to: target,
            start: now
          };
        rev = currentRevenue(revenue.current!, now);
      }

      setShown(s =>
        s.blocks === blocks && s.revenue === rev ? s : { blocks, revenue: rev }
      );
      const revenueMoving =
        revenue.current != null &&
        now - revenue.current.start < REVENUE_STEP_MS;
      if (t < 1 || revenueMoving) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // A new poll mid-count carries on from wherever the count has got to.
    return () => cancelAnimationFrame(raf);
  }, [latest, intervalMs]);

  return shown;
};

const currentRevenue = (
  r: { from: number; to: number; start: number },
  now: number
) => {
  const t = Math.min(1, (now - r.start) / REVENUE_STEP_MS);
  // Ease out: a quick step that settles.
  const e = 1 - (1 - t) ** 3;
  return Math.round(r.from + (r.to - r.from) * e);
};

export default useTrailingTotals;
