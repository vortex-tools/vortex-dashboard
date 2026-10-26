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

/** How a slot is drawn (dot color) and named. */
export const SLOT_KIND: Record<SlotKind, { cls: string; label: string }> = {
  fast: { cls: 'bg-primary', label: 'fast-finalized' },
  // A ring, not a fill: the slow (two-round) path should stand out.
  slow: {
    cls: 'border border-2 border-primary bg-body-emphasis',
    label: 'slow-finalized'
  },
  block: { cls: 'bg-primary opacity-50', label: 'finalized via a later block' },
  // Produced, finalization not known yet (it fills in a few slots later):
  // not 'via a later block', which it would read as until then.
  finalizing: {
    cls: 'border border-primary border-opacity-50 bg-body-emphasis',
    label: 'finalizing'
  },
  skipped: { cls: 'bg-warning', label: 'skipped' },
  noData: { cls: 'bg-body-secondary', label: 'no data' },
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
    {(
      [
        'fast',
        'slow',
        'block',
        'finalizing',
        'skipped',
        'upcoming'
      ] as SlotKind[]
    ).map(k => (
      <span key={k} className="d-inline-flex align-items-center gap-1">
        <span
          className={`d-inline-block rounded-circle ${SLOT_KIND[k].cls}`}
          style={{ width: 10, height: 10 }}
        />
        {SLOT_KIND[k].label}
      </span>
    ))}
  </div>
);
