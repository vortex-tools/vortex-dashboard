import { decodeLeaderIndexes } from 'helpers/participation';
import { fetchSlots } from 'helpers/slotContext';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { SlotInfo } from 'providers/vortex-schemas';
import { useContext, useEffect, useMemo, useState } from 'react';

const WINDOW = 4;
// How many windows ahead to list.
const AHEAD = 5;
// Re-read the window being produced this often (its slots fill in over a
// few seconds).
const POLL_MS = 2_000;
// Re-anchor the estimated current slot (/epochs/current) this often.
const ANCHOR_MS = 60_000;

/** "in 42s" / "in 12m 05s" / "in 3h 20m" (or "… ago"). */
export const when = (secs: number) => {
  const a = Math.abs(Math.round(secs));
  const t =
    a < 60
      ? `${a}s`
      : a < 3600
        ? `${Math.floor(a / 60)}m ${String(a % 60).padStart(2, '0')}s`
        : `${Math.floor(a / 3600)}h ${String(Math.floor((a % 3600) / 60)).padStart(2, '0')}m`;
  return secs >= 0 ? `in ${t}` : `${t} ago`;
};

export type LiveWindow = {
  firstSlot: number;
  state: 'played' | 'now' | 'ahead';
};

/**
 * A validator's leader windows this epoch, live, for the top of its
 * Produced Blocks table: the one being produced and the next few, from
 * the epoch's leader schedule (/epochs/leader-schedule) and the current
 * slot estimated from /epochs/current at the observed slot time
 * (re-anchored every minute), plus windows played since the
 * produced-blocks data's newest. Those and the window being produced fill in from
 * /slots (block / skipped only - its inclusion of online stake comes with
 * the produced-blocks data once ingested). `slotNow` / `slotSecs` time
 * every row.
 */
const useLiveWindows = (
  nodeAddress: string | null | undefined,
  epoch: number,
  enabled: boolean,
  /** The newest window the produced-blocks data has: windows played
   *  since (not ingested yet) are listed too, as 'played'. */
  since: number | null = null
) => {
  const context = useContext(VortexDataContext);
  const scheduleSlice = context?.leaderScheduleState;
  const schedule = scheduleSlice?.data.get(epoch);
  const fetchSchedule = scheduleSlice?.fetchData;
  useEffect(() => {
    if (enabled) fetchSchedule?.(epoch);
  }, [enabled, epoch, fetchSchedule]);

  // This validator's windows (first slots), in order.
  const windows = useMemo(() => {
    if (!schedule || !nodeAddress) return [];
    const idx = decodeLeaderIndexes(schedule.leaderIndexesBase64);
    const me = schedule.leaders.indexOf(nodeAddress);
    if (me < 0) return [];
    const out: number[] = [];
    for (let e = 0; e < idx.length; e++) {
      if (idx[e] !== me) continue;
      const w =
        schedule.firstSlot +
        Math.floor((e * schedule.slotsPerEntry) / WINDOW) * WINDOW;
      if (out[out.length - 1] !== w) out.push(w);
    }
    return out;
  }, [schedule, nodeAddress]);

  const epochState = context?.currentEpochState;
  const refresh = epochState?.refresh;
  useEffect(() => {
    if (!enabled || !refresh) return;
    const id = setInterval(refresh, ANCHOR_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);
  const p = epochState?.progress;
  const slotSecs = p?.slotSeconds ?? 0.4;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  const slotNow =
    enabled && p?.absoluteSlot != null && p.readAt != null
      ? p.absoluteSlot + Math.floor((now / 1000 - p.readAt) / slotSecs)
      : null;

  const at =
    slotNow != null ? windows.findIndex(w => w + WINDOW > slotNow) : -1;
  // Played since the produced-blocks data's newest (a few, while it
  // catches up), the one being produced, and the next few.
  const from =
    since == null
      ? at
      : Math.max(
          0,
          windows.findIndex(w => w > since)
        );
  const live: LiveWindow[] =
    at < 0 || from < 0
      ? []
      : windows
          .slice(Math.min(from, at), at + AHEAD)
          .slice(-(AHEAD + 8))
          .map(w => ({
            firstSlot: w,
            state:
              slotNow != null && w + WINDOW <= slotNow
                ? 'played'
                : slotNow != null && w <= slotNow
                  ? 'now'
                  : 'ahead'
          }));
  const ahead = at < 0 ? 0 : windows.length - at;

  // The windows played or being produced, from /slots.
  const [infos, setInfos] = useState<Map<number, SlotInfo | null>>(
    () => new Map()
  );
  const fillKey = live
    .filter(l => l.state !== 'ahead')
    .map(l => l.firstSlot)
    .join(',');
  useEffect(() => {
    if (!fillKey) return;
    const slots = fillKey
      .split(',')
      .flatMap(w => Array.from({ length: WINDOW }, (_, k) => +w + k));
    let alive = true;
    const load = () =>
      fetchSlots(slots).then(
        m => alive && setInfos(prev => new Map([...prev, ...m])),
        () => undefined
      );
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [fillKey]);

  return { live, ahead, total: windows.length, slotNow, slotSecs, infos };
};

export default useLiveWindows;
