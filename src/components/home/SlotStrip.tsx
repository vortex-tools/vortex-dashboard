import SectionCard from 'components/common/SectionCard';
import { SLOT_KIND, SlotDotLegend, slotKind } from 'components/live/slotDots';
import { fetchSlots } from 'helpers/slotContext';
import { useClusterHalt, useEpochLive } from 'hooks/useIngestion';
import { SlotInfo } from 'providers/vortex-schemas';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

const N = 64;
const TICK_MS = 1_000;
/** Don't run the slot estimate further than this past the ingested tip. */
const MAX_AHEAD = 24;

/**
 * The cluster's last 64 slots as dots, filling in from the right as they
 * happen (Cluster Status's colors): the ingested tip from /epochs/current,
 * run on at the epoch's slot time between polls, the slots from /slots.
 * A halted cluster stops at its last slot.
 */
const SlotStrip = () => {
  const live = useEpochLive(true, 5_000);
  const halt = useClusterHalt();
  const tip = live.ingestion?.footers?.lastSlot ?? null;
  const slotMs = (live.progress?.slotSeconds ?? 0.4) * 1000;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);
  // The newest slot to show: the tip, plus the slots since the poll.
  const edge =
    tip == null
      ? null
      : halt
        ? Math.min(tip, halt.slot)
        : tip +
          Math.min(
            MAX_AHEAD,
            Math.max(0, Math.floor((now - (live.okAt ?? now)) / slotMs))
          );
  const [infos, setInfos] = useState<Map<number, SlotInfo | null>>(new Map());
  useEffect(() => {
    if (edge == null) return;
    let stop = false;
    const slots = Array.from({ length: N }, (_, i) => edge - N + 1 + i);
    fetchSlots(slots)
      .then(m => {
        if (!stop) setInfos(m);
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [edge]);
  if (edge == null) return null;
  const slots = Array.from({ length: N }, (_, i) => edge - N + 1 + i);
  return (
    <SectionCard
      title={halt ? 'Last Slots Before the Halt' : 'Live Slots'}
      icon="radio"
      linkTo="/status"
      linkLabel="Cluster status"
    >
      <div
        className="d-flex flex-wrap gap-1"
        role="img"
        aria-label={`The last ${N} slots, up to ${edge.toLocaleString()}`}
      >
        {slots.map(s => {
          const k = slotKind(s, infos.get(s), halt ? halt.slot : tip);
          return (
            <Link
              key={s}
              to={`/slot/${s}`}
              title={`Slot ${s.toLocaleString()}: ${SLOT_KIND[k].label}`}
              className={`d-inline-block rounded-circle ${SLOT_KIND[k].cls}`}
              style={{ width: 12, height: 12 }}
            />
          );
        })}
      </div>
      <div className="mt-2">
        <SlotDotLegend />
      </div>
    </SectionCard>
  );
};

export default SlotStrip;
