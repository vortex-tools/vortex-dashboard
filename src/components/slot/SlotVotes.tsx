import { SlotPage } from 'providers/VortexDataProvider';

/** ppb -> "97.01%"; null = no certificate of that kind. */
export const pct2 = (ppb: number | null | undefined) =>
  ppb == null ? '—' : `${(ppb / 1e7).toFixed(2)}%`;

export const plural = (n: number, w: string) =>
  `${n.toLocaleString()} ${w}${n === 1 ? '' : 's'}`;

/** Why a slot has no reward certificate: its paying slot (slot + 8) was
 *  skipped, or that block carried no reward certificates. */
export type Unrewardable = 'skipped' | 'noCerts';

/**
 * How a block was finalized. The footer record (finalization.directPath)
 * only knows certificates some footer carried, and each footer carries
 * just the highest certificate its leader knew - so a block's own fast
 * certificate can be skipped over (the next footers carry a lower and
 * then a higher slot's), and the record says 'via a later block'. Where
 * live consensus recorded the slot (pool), its own certificate wins.
 */
export const finalizationPathOf = (page: SlotPage) => {
  const fin = page.alpenglow?.finalization;
  const certs = page.pool?.certificates ?? [];
  if (fin?.directPath) {
    // The API folds in the live certificate itself (directSource 'live').
    const live = fin.directSource === 'live';
    const cert = certs.find(c =>
      fin.directPath === 'fast'
        ? c.kind === 'fastFinalize'
        : c.kind === 'finalize'
    );
    return {
      path: fin.directPath,
      seenLive: live,
      formedMs: live ? (cert?.formedMs ?? null) : null
    };
  }
  const fast = certs.find(c => c.kind === 'fastFinalize');
  if (fast) return { path: 'fast', seenLive: true, formedMs: fast.formedMs };
  const slow = certs.find(c => c.kind === 'finalize');
  if (slow) return { path: 'slow', seenLive: true, formedMs: slow.formedMs };
  return { path: null, seenLive: false, formedMs: null };
};
