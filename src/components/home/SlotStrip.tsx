import SectionCard from 'components/common/SectionCard';
import LiveSlotStrip, { StripCell } from 'components/live/LiveSlotStrip';
import { SLOT_KIND, SlotKind, slotKind } from 'components/live/slotDots';
import { fetchSlots, noteIngestTip } from 'helpers/slotContext';
import { useClusterHalt, useEpochLive } from 'hooks/useIngestion';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { SlotInfo } from 'providers/vortex-schemas';
import { useCallback, useContext, useEffect, useState } from 'react';

/** Slots fetched behind the tip: more than the widest strip shows. */
const SPAN = 256;

const LEGEND_KINDS: SlotKind[] = [
  'fast',
  'slow',
  'block',
  'finalizing',
  'skipped'
];
const LEGEND: Array<[string, string]> = LEGEND_KINDS.map(k => [
  SLOT_KIND[k].cls,
  SLOT_KIND[k].label
]);

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/**
 * The cluster's latest slots on the live slot strip (Cluster Status's
 * colors): a column per leader window, newest at the left, revealed at
 * block pace a little behind the ingested tip (/epochs/current), the
 * slots from /slots. A halted cluster stops at its last slot.
 */
const SlotStrip = () => {
  const context = useContext(VortexDataContext);
  const live = useEpochLive(true, 5_000);
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

  // The last SPAN slots, merged as the tip moves (slots near the tip are
  // refetched until they settle - see fetchSlots).
  const [infos, setInfos] = useState<Map<number, SlotInfo | null>>(
    () => new Map()
  );
  useEffect(() => {
    if (tip == null) return;
    noteIngestTip(ingested);
    let stop = false;
    const slots = Array.from({ length: SPAN }, (_, i) => tip - SPAN + 1 + i);
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
  const oldest = infos.size ? Math.min(...infos.keys()) : null;

  const cellOf = useCallback(
    (s: number): StripCell | null => {
      const info = infos.get(s);
      if (!info?.outcome) return null;
      return SLOT_KIND[slotKind(s, info, s)];
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

  if (tip == null) return null;
  return (
    <SectionCard
      title={halt ? 'Last Slots Before the Halt' : 'Live Slots'}
      icon="radio"
      linkTo="/status"
      linkLabel="Cluster status"
    >
      <LiveSlotStrip
        recorded={infos.size ? tip : null}
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
      />
    </SectionCard>
  );
};

export default SlotStrip;
