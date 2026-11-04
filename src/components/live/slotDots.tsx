import { SlotInfo } from 'providers/vortex-schemas';

export const WINDOW = 4;

export type SlotKind =
  | 'fast'
  | 'slow'
  | 'block'
  | 'finalizing'
  | 'skipped'
  | 'noData'
  | 'upcoming';

/** How a slot is drawn (dot color) and named - the live slot strips'
 *  palette (Home, the Voting tab): green blocks, fainter when not
 *  fast-finalized, a skip as a white dot with a gray ring. */
const SLOW = { cls: 'bg-success opacity-50', label: 'slow-finalized' };
export const SLOT_KIND: Record<SlotKind, { cls: string; label: string }> = {
  fast: { cls: 'bg-success', label: 'fast-finalized' },
  // Not fast: its own certificate on the two-round path, or none of its
  // own (final because a later block on it was) - one color for both.
  slow: SLOW,
  block: SLOW,
  // Produced, finalization not known yet (it fills in a few slots later).
  finalizing: {
    cls: 'bg-body-emphasis border border-2 border-success border-opacity-50',
    label: 'finalizing'
  },
  skipped: {
    cls: 'bg-body-emphasis border border-2 border-pending',
    label: 'skipped'
  },
  noData: { cls: 'bg-body-secondary opacity-50', label: 'no data' },
  upcoming: { cls: 'border border-translucent opacity-75', label: 'upcoming' }
};

/** A slot's kind as of the playhead: not reached yet = upcoming. */
export const slotKind = (
  s: number,
  info: SlotInfo | null | undefined,
  playhead: number | null
): SlotKind => {
  if (playhead == null || s > playhead || !info?.outcome) return 'upcoming';
  if (info.outcome === 'block')
    return !info.finalization
      ? 'finalizing'
      : info.finalization.directPath === 'fast'
        ? 'fast'
        : info.finalization.directPath === 'slow'
          ? 'slow'
          : 'block';
  return info.outcome;
};

/** What the slot dots mean. */
export const SlotDotLegend = () => (
  <div className="d-flex flex-wrap gap-3 fs-10 text-body-tertiary">
    {(['fast', 'slow', 'finalizing', 'skipped', 'upcoming'] as SlotKind[]).map(
      k => (
        <span key={k} className="d-inline-flex align-items-center gap-1">
          <span
            className={`d-inline-block rounded-circle ${SLOT_KIND[k].cls}`}
            style={{ width: 10, height: 10 }}
          />
          {SLOT_KIND[k].label}
        </span>
      )
    )}
  </div>
);

/**
 * A leader window's handoff, live: from the previous window's last block
 * to this window's first, by the producers' own block times (footer
 * producerTimeNanos; a clamped time - a clock off - leaves it untimed).
 * `afterSkip`: this window's first slot was skipped, `beforeSkip`: the
 * previous window's last - either way the gap includes the skip. null
 * until both blocks are in.
 */
/** The nearest block from `start` stepping by `dir`, past skipped slots
 *  only: its time, 'clamped' when its time is clamped (a clock off -
 *  reading past it would call a timed later block a skip), null when not
 *  in yet. */
const nearestBlock = (
  infos: Map<number, SlotInfo | null>,
  start: number,
  dir: 1 | -1
): { t: number; skipped: boolean } | 'clamped' | null => {
  for (let i = 0; i < WINDOW; i++) {
    const info = infos.get(start + dir * i);
    if (info?.outcome === 'skipped') continue;
    if (info?.outcome !== 'block') return null;
    const f = info.footer;
    return f?.producerTimeNanos != null && !f.clockClamp
      ? { t: f.producerTimeNanos, skipped: i > 0 }
      : 'clamped';
  }
  return null;
};

/** Whether a window's handoff can't be timed: a block either side of it
 *  has a clamped time. */
export const handoffClamped = (
  first: number,
  infos: Map<number, SlotInfo | null>
) =>
  nearestBlock(infos, first - 1, -1) === 'clamped' ||
  nearestBlock(infos, first, 1) === 'clamped';

export const windowHandoff = (
  first: number,
  infos: Map<number, SlotInfo | null>
): { ms: number; afterSkip: boolean; beforeSkip: boolean } | null => {
  const prev = nearestBlock(infos, first - 1, -1);
  const next = nearestBlock(infos, first, 1);
  if (!prev || !next || prev === 'clamped' || next === 'clamped') return null;
  return {
    ms: (next.t - prev.t) / 1e6,
    afterSkip: next.skipped,
    beforeSkip: prev.skipped
  };
};
