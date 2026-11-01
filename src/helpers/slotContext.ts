import { API_ENDPOINT } from 'helpers/apiEndpoint';
import {
  SlotFooter,
  SlotInfo,
  footerRangeSchema,
  slotFooterSchema,
  slotRangeSchema
} from 'providers/vortex-schemas';

/**
 * What happened on individual slots (/slots, one item per slot: outcome,
 * leader, votes on it, finalization), for tables of slots. Fetched in as
 * few requests as possible: a contiguous run as a <= 1,000-slot range,
 * scattered slots as a list. A slot is cached for the
 * session once it's settled (outcome, votes and - for a block -
 * finalization all known), or once it's deep enough behind the ingest tip
 * that nothing about it changes: an answer missing a part (no votes, no
 * certificate, a finalization never recorded, no row) then stays as it
 * is rather than being polled forever. Slots near the tip are refetched
 * next time.
 *
 * Transitional: APIs from before the per-slot /slots endpoint (404) fall
 * back to /slots/footers for the votes (footer of slot + 8). Remove once
 * every instance serves /slots.
 */
const cache = new Map<number, SlotInfo | null>();
const MAX_RANGE = 1000;

/**
 * Depths behind the ingest tip past which a slot is final, whatever the
 * API said about it (vortex-billing, from alpenglow-ingest): the ingest
 * cursor never passes a slot it can't decide, so outcomes at or behind it
 * are final; votes come from slot + 8's footer and finalization from a
 * later one (lag p99 2 slots). A block still without finalization gets
 * until the stored lag's cap (255).
 */
export const SETTLED_DEPTH = 64;
export const UNFINALIZED_DEPTH = 256;
/** The ingest tip: /epochs/current ingestion.footers.lastSlot when a page
 *  has it, else the newest slot any /slots answer carried an outcome for
 *  (/slots serves ingested slots only). */
let tip = 0;
export const noteIngestTip = (slot: number | null | undefined) => {
  if (slot != null && slot > tip) tip = slot;
};
const final = (s: number, i: SlotInfo | null) =>
  tip > 0 &&
  s <
    tip -
      (i?.outcome === 'block' && i.finalization == null
        ? UNFINALIZED_DEPTH
        : SETTLED_DEPTH);

/** Outcome, votes and (for a block) finalization all known: won't change. */
export const settled = (s: SlotInfo) =>
  s.outcome != null &&
  s.votes != null &&
  (s.outcome !== 'block' || s.finalization != null);

const groupRanges = (slots: number[]): Array<[number, number]> => {
  const ranges: Array<[number, number]> = [];
  for (const s of [...new Set(slots)].sort((a, b) => a - b)) {
    const last = ranges[ranges.length - 1];
    if (last && s - last[0] < MAX_RANGE) last[1] = s;
    else ranges.push([s, s]);
  }
  return ranges;
};

let legacy = false; // /slots answered 404 once: use /slots/footers

const legacyRange = async (start: number, end: number): Promise<SlotInfo[]> => {
  const res = await fetch(
    `${API_ENDPOINT}/slots/footers?startSlot=${start + 8}&endSlot=${end + 8}`
  );
  if (!res.ok) throw new Error(`footers ${res.status}`);
  const { footers } = footerRangeSchema.parse(await res.json());
  return footers.map(f => ({
    slot: f.rewardSlot,
    outcome: null,
    leader: null,
    votes: {
      notarStakePpb: f.notarStakePpb,
      skipStakePpb: f.skipStakePpb,
      signers: f.signers
    },
    finalization: null
  }));
};

/** Slots per list request (/slots?slots=, the API's cap). */
const MAX_LIST = 500;
let noList = false; // /slots answered a list with 400 once: ranges only

/** A contiguous range's slots, from /slots (or the legacy footers). */
const fetchRange = async (start: number, end: number): Promise<SlotInfo[]> => {
  if (legacy) return legacyRange(start, end);
  const res = await fetch(
    `${API_ENDPOINT}/slots?startSlot=${start}&endSlot=${end}`
  );
  if (res.status === 404) {
    legacy = true;
    return legacyRange(start, end);
  }
  if (!res.ok) throw new Error(`slots ${res.status}`);
  return slotRangeSchema.parse(await res.json()).slots;
};

/** Scattered slots in one request (/slots?slots=a,b,c); falls back to
 *  their ranges on an API without the list form (400) or /slots (404). */
const fetchList = async (slots: number[]): Promise<SlotInfo[]> => {
  if (!legacy && !noList) {
    const res = await fetch(`${API_ENDPOINT}/slots?slots=${slots.join(',')}`);
    if (res.ok) return slotRangeSchema.parse(await res.json()).slots;
    if (res.status === 400) noList = true;
    else if (res.status === 404) legacy = true;
    else throw new Error(`slots ${res.status}`);
  }
  const ranges = await Promise.all(
    groupRanges(slots).map(([start, end]) => fetchRange(start, end))
  );
  return ranges.flat();
};

/**
 * Slots' facts. One contiguous run (a live strip) is a range request;
 * scattered slots (a table's rows across an epoch) go as lists of up to
 * MAX_LIST, so a page costs one request rather than one per cluster.
 */
export const fetchSlots = async (
  slots: number[]
): Promise<Map<number, SlotInfo | null>> => {
  const out = new Map<number, SlotInfo | null>();
  const todo = [...new Set(slots)]
    .filter(s => {
      if (!cache.has(s)) return true;
      out.set(s, cache.get(s)!);
      return false;
    })
    .sort((a, b) => a - b);
  if (!todo.length) return out;
  const ranges = groupRanges(todo);
  const batches: Array<() => Promise<SlotInfo[]>> =
    ranges.length === 1 || noList
      ? ranges.map(
          ([start, end]) =>
            () =>
              fetchRange(start, end)
        )
      : Array.from({ length: Math.ceil(todo.length / MAX_LIST) }, (_, n) => {
          const chunk = todo.slice(n * MAX_LIST, (n + 1) * MAX_LIST);
          return () => fetchList(chunk);
        });
  const items = (await Promise.all(batches.map(f => f()))).flat();
  const bySlot = new Map(items.map(i => [i.slot, i]));
  for (const i of items) if (i.outcome != null) noteIngestTip(i.slot);
  for (const s of todo) {
    const i = bySlot.get(s) ?? null;
    if ((i && settled(i)) || final(s, i)) cache.set(s, i);
    out.set(s, i);
  }
  return out;
};

/** /slots/footer URL for a block (its footer decoded, with the proof). */
export const footerUrl = (slot: number) =>
  `${API_ENDPOINT}/slots/footer?slot=${slot}`;

const footerCache = new Map<number, SlotFooter | null>();

/**
 * One block's decoded footer (/slots/footer): parent, the certificates it
 * carried and their stake. Immutable, so cached for the session; null when
 * the block has no footer row (404).
 */
export const fetchFooter = async (slot: number): Promise<SlotFooter | null> => {
  if (footerCache.has(slot)) return footerCache.get(slot)!;
  const res = await fetch(footerUrl(slot));
  if (res.status === 404) {
    footerCache.set(slot, null);
    return null;
  }
  if (!res.ok) throw new Error(`footer ${res.status}`);
  const f = slotFooterSchema.parse(await res.json());
  footerCache.set(slot, f);
  return f;
};
