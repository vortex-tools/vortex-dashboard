import SectionCard from 'components/common/SectionCard';
import LiveSlotStrip, { StripCell } from 'components/live/LiveSlotStrip';
import { SlotKind, slotKind } from 'components/live/slotDots';
import { fetchSlots, noteIngestTip } from 'helpers/slotContext';
import { useClusterHalt, useEpochLive } from 'hooks/useIngestion';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { SlotInfo } from 'providers/vortex-schemas';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

/** Slots fetched behind the tip: more than the widest strip shows. */
const SPAN = 512;

/** Slots this close to the tip are refetched while still missing their
 *  outcome or (a block) finalization. */
const REFETCH_DEPTH = 64;

/** Polled this often: the strip's data refresh. */
const POLL_MS = 2_000;
/** Slots the playhead trails the newest loaded one by: more than a poll
 *  plus its fetch brings (~2.5 s of slots), so it never waits on data. */
const LEAD = 16;

// In the Voting tab's live strip's palette: green blocks (fainter when
// not fast-finalized), a skipped slot as a white dot with a gray ring.
const SLOW: StripCell = {
  cls: 'bg-success opacity-50',
  label: 'block, slow-finalized'
};
const CELL: Record<Exclude<SlotKind, 'upcoming'>, StripCell> = {
  fast: { cls: 'bg-success', label: 'block, fast-finalized' },
  // Not fast: its own certificate on the two-round path, or none of its
  // own (final because a later block on it was) - one color for both.
  slow: SLOW,
  block: SLOW,
  finalizing: {
    cls: 'bg-body-emphasis border border-2 border-success border-opacity-50',
    label: 'block, finalizing'
  },
  skipped: {
    cls: 'bg-body-emphasis border border-2 border-pending',
    label: 'skipped'
  },
  noData: { cls: 'bg-body-secondary opacity-50', label: 'no data' }
};
// No "finalizing": the playhead trails the newest loaded slot by LEAD,
// and a block's finalization is known within a couple of slots, so it's
// all but never drawn (a ring if it is).
const LEGEND: Array<[string, string]> = [
  [CELL.fast.cls, 'fast-finalized'],
  [SLOW.cls, 'slow-finalized'],
  [CELL.skipped.cls, 'skipped']
];

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/**
 * The cluster's latest slots on the live slot strip, in the Voting tab
 * strip's palette: a column per leader window, newest at the left,
 * revealed at block pace a little behind the newest loaded slot (/slots,
 * behind /epochs/current's ingested tip). A halted cluster stops at its
 * last slot.
 */
const SlotStrip = () => {
  const context = useContext(VortexDataContext);
  const live = useEpochLive(true, POLL_MS);
  const halt = useClusterHalt();
  const ingested = live.ingestion?.footers?.lastSlot ?? null;
  const tip =
    ingested == null ? null : halt ? Math.min(ingested, halt.slot) : ingested;
  const p = live.progress;
  const slotMs = Math.round((p?.slotSeconds ?? 0.4) * 1000);
  const epochStart =
    p?.absoluteSlot != null && p.slotIndex != null
      ? p.absoluteSlot - p.slotIndex
      : 0;

  // The last SPAN slots, merged as the tip moves. /slots reads its whole
  // range from storage on every call, so after the first load a poll asks
  // only for what's new - past the newest slot with an outcome - and the
  // few blocks still waiting on their finalization (or rows not there
  // yet) near the tip, not every unsettled slot.
  const [infos, setInfos] = useState<Map<number, SlotInfo | null>>(
    () => new Map()
  );
  const infosRef = useRef(infos);
  infosRef.current = infos;
  useEffect(() => {
    if (tip == null) return;
    noteIngestTip(ingested);
    let stop = false;
    const have = infosRef.current;
    let newest: number | null = null;
    for (const [sl, v] of have)
      if (v?.outcome && (newest == null || sl > newest)) newest = sl;
    const from = Math.max(tip - SPAN + 1, newest != null ? newest + 1 : 0);
    const slots = Array.from(
      { length: Math.max(0, tip - from + 1) },
      (_, i) => from + i
    );
    if (newest != null)
      for (const [sl, v] of have)
        if (
          sl > tip - REFETCH_DEPTH &&
          sl <= newest &&
          (!v?.outcome || (v.outcome === 'block' && !v.finalization))
        )
          slots.push(sl);
    if (!slots.length) return;
    fetchSlots(slots)
      .then(m => {
        if (stop) return;
        setInfos(prev => {
          const next = new Map<number, SlotInfo | null>();
          for (const [s, v] of prev) if (s > tip - SPAN) next.set(s, v);
          for (const [s, v] of m) next.set(s, v);
          return next;
        });
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [tip, ingested]);
  // The oldest slot held, and the newest with an outcome: the playhead
  // never reveals a slot that hasn't loaded (it would pop in late).
  const { oldest, newest } = useMemo(() => {
    let lo: number | null = null;
    let hi: number | null = null;
    for (const [s, v] of infos) {
      if (lo == null || s < lo) lo = s;
      if (v?.outcome && (hi == null || s > hi)) hi = s;
    }
    return { oldest: lo, newest: hi };
  }, [infos]);

  const cellOf = useCallback(
    (s: number): StripCell | null => {
      const info = infos.get(s);
      if (!info?.outcome) return null;
      const k = slotKind(s, info, s);
      return k === 'upcoming' ? null : CELL[k];
    },
    [infos]
  );
  const leaderOf = useCallback((s: number) => infos.get(s)?.leader, [infos]);
  const dir = context?.validatorDirectoryState.byNodeAddress;
  const nameOf = useCallback(
    (node: string | null) =>
      node ? (dir?.get(node)?.name ?? short(node)) : null,
    [dir]
  );

  const [held, setHeld] = useState(false);
  if (tip == null) return null;
  return (
    <SectionCard
      title={halt ? 'Last Slots Before the Halt' : 'Live Slots'}
      icon="radio"
      linkTo="/status"
      linkLabel="Cluster status"
      highlight={held}
    >
      {/* Centered in the card, which matches its neighbor's height. */}
      <div className="flex-grow-1 d-flex flex-column justify-content-center">
        <LiveSlotStrip
          recorded={newest}
          lead={LEAD}
          oldest={oldest}
          epochStart={epochStart}
          slotMs={slotMs}
          cellOf={cellOf}
          leaderOf={leaderOf}
          nameOf={nameOf}
          label={halt ? 'Halted' : 'Live slots'}
          legend={LEGEND}
          footnote="Replayed at block pace"
          footnoteTitle="Each slot as the chain recorded it - its block or skip, and how the block finalized - shown one per slot-time a little behind the chain."
          waiting="waiting for slots…"
          className=""
          onHeldChange={setHeld}
          headerless
        />
      </div>
    </SectionCard>
  );
};

export default SlotStrip;
