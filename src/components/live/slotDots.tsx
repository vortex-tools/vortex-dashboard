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
 * producerTimeNanos; a clamped time - a clock off - doesn't count).
 * `afterSkip`: this window's first slot was skipped, so the gap includes
 * that skip. null until both blocks are in.
 */
export const windowHandoff = (
  first: number,
  infos: Map<number, SlotInfo | null>
): { ms: number; afterSkip: boolean } | null => {
  const time = (s: number) => {
    const f = infos.get(s)?.footer;
    return infos.get(s)?.outcome === 'block' &&
      f?.producerTimeNanos != null &&
      !f.clockClamp
      ? f.producerTimeNanos
      : null;
  };
  let prev: number | null = null;
  for (let s = first - 1; s >= first - WINDOW && prev == null; s--)
    prev = time(s);
  let next: number | null = null;
  let k = 0;
  for (; k < WINDOW && next == null; k++) next = time(first + k);
  if (prev == null || next == null) return null;
  return { ms: (next - prev) / 1e6, afterSkip: k > 1 };
};
