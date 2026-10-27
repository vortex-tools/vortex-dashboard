import { API_ENDPOINT } from 'helpers/apiEndpoint';
import { z } from 'zod';
import { useEffect, useRef, useState } from 'react';

// /cluster/blocks/recent: the block ingestor's newest blocks, slot
// ascending (skipped slots absent), served from memory. Block time is
// whole seconds; it trails the tip by ~20 slots.
const recentBlocksSchema = z.object({
  readAt: z.number().nullable().catch(null),
  newestSlot: z.number().nullable().catch(null),
  blocks: z
    .array(
      z.object({
        slot: z.number(),
        t: z.number(),
        transactions: z.number().catch(0),
        computeUnits: z.number().catch(0),
        baseFees: z.number().catch(0),
        priorityFees: z.number().catch(0),
        mevTips: z.number().catch(0)
      })
    )
    .catch([])
});
export type RecentBlock = z.infer<typeof recentBlocksSchema>['blocks'][number];

/** Blocks kept: the API's maximum first load (~4 minutes). */
const KEEP = 1024;
const POLL_MS = 2_000;
/** Without the endpoint (404: no block ingestor, or not deployed), look
 *  again this rarely. */
const ABSENT_RETRY_MS = 5 * 60_000;

/**
 * The cluster's newest blocks, kept up to date: the last KEEP on the
 * first read, then every 2 s only those after the newest held (afterSlot),
 * while the tab is visible. Null until there are any (or where the
 * endpoint doesn't exist).
 */
const useRecentBlocks = (enabled = true): RecentBlock[] | null => {
  const [blocks, setBlocks] = useState<RecentBlock[] | null>(null);
  const ref = useRef<RecentBlock[] | null>(null);
  ref.current = blocks;
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let next = POLL_MS;
      if (document.visibilityState !== 'hidden') {
        const have = ref.current;
        const after = have?.length ? have[have.length - 1].slot : null;
        const params = new URLSearchParams({ slots: String(KEEP) });
        if (after != null) params.set('afterSlot', String(after));
        try {
          const res = await fetch(
            `${API_ENDPOINT}/cluster/blocks/recent?${params}`,
            { signal: AbortSignal.timeout(10_000) }
          );
          if (res.status === 404) next = ABSENT_RETRY_MS;
          else if (res.ok) {
            const { blocks: got } = recentBlocksSchema.parse(await res.json());
            if (!stop && got.length)
              setBlocks(prev => {
                const merged = [
                  ...(prev ?? []).filter(b => b.slot < got[0].slot),
                  ...got
                ];
                return merged.slice(-KEEP);
              });
          }
        } catch {
          // Transient: the next poll tries again.
        }
      }
      if (!stop) t = setTimeout(poll, next);
    };
    poll();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [enabled]);
  return blocks;
};

export default useRecentBlocks;
