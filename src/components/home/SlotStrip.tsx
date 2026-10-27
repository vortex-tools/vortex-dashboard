import SectionCard from 'components/common/SectionCard';
import {
  SLOT_KIND,
  SlotDotLegend,
  WINDOW,
  slotKind
} from 'components/live/slotDots';
import { fetchSlots } from 'helpers/slotContext';
import { useClusterHalt, useEpochLive } from 'hooks/useIngestion';
import useMediaQuery from 'hooks/useMediaQuery';
import { SlotInfo } from 'providers/vortex-schemas';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router';

const ROWS = 4;
const TICK_MS = 1_000;
/** Don't run the slot estimate further than this past the ingested tip. */
const MAX_AHEAD = 24;

/**
 * The cluster's latest leader windows as dots (Cluster Status's colors),
 * newest first like its leaders table: four rows of windows read left to
 * right, top to bottom, each window's four slots in slot order, so a new
 * leader appears at the top left and pushes the rest along. The tip is
 * the ingested one from /epochs/current, run on at the epoch's slot time
 * between polls; the slots come from /slots. A halted cluster stops at
 * its last slot.
 */
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`;

const SlotStrip = () => {
  const live = useEpochLive(true, 5_000);
  const halt = useClusterHalt();
  const dir = useContext(VortexDataContext)?.validatorDirectoryState;
  // A window's leader, for its hover title.
  const leaderOf = (first: number) => {
    const node = Array.from({ length: WINDOW }, (_, k) =>
      infos.get(first + k)
    ).find(i => i?.leader)?.leader;
    return node ? (dir?.byNodeAddress?.get(node)?.name ?? short(node)) : null;
  };
  // Fewer windows a row on phones.
  const narrow = useMediaQuery('(max-width: 767.98px)');
  const perRow = narrow ? 4 : 8;
  const windows = ROWS * perRow;
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
  // The newest window's first slot (windows are 4-slot aligned).
  const head = edge == null ? null : edge - (edge % WINDOW);
  useEffect(() => {
    if (edge == null || head == null) return;
    let stop = false;
    const first = head - (windows - 1) * WINDOW;
    const slots = Array.from({ length: edge - first + 1 }, (_, i) => first + i);
    fetchSlots(slots)
      .then(m => {
        if (!stop) setInfos(m);
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [edge, head, windows]);
  if (edge == null || head == null) return null;
  const firsts = Array.from({ length: windows }, (_, i) => head - i * WINDOW);
  const playhead = halt ? halt.slot : tip;
  return (
    <SectionCard
      title={halt ? 'Last Slots Before the Halt' : 'Live Slots'}
      icon="radio"
      linkTo="/status"
      linkLabel="Cluster status"
    >
      <div
        className="d-grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${perRow}, max-content)`,
          columnGap: '0.75rem'
        }}
        role="img"
        aria-label={`The latest ${windows} leader windows, newest first, up to slot ${edge.toLocaleString()}`}
      >
        {firsts.map(first => (
          <div
            key={first}
            className="d-flex gap-1 vx-window-in"
            title={leaderOf(first) ?? undefined}
          >
            {Array.from({ length: WINDOW }, (_, k) => first + k).map(s => {
              const k = slotKind(s, infos.get(s), playhead);
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
        ))}
      </div>
      <div className="mt-2">
        <SlotDotLegend />
      </div>
    </SectionCard>
  );
};

export default SlotStrip;
