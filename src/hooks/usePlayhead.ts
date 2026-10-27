import { useEffect, useRef, useState } from 'react';

// Pacing as in the live slot strip: a step takes the slot time scaled by
// how far the playhead is from its lead (slower as it nears the data,
// faster when behind), within these bounds; it jumps when far behind.
const PACE_MIN = 0.6;
const PACE_MAX = 1.6;
const JUMP = 96;

/**
 * A slot playhead over data that arrives in bursts: starts `lead` slots
 * behind `newest`, then steps a slot per `slotMs`, eased by its gap to
 * `lead` so it glides instead of catching the edge and waiting; never
 * passes `newest`. Null until there is data.
 */
const usePlayhead = (
  newest: number | null,
  slotMs: number,
  lead: number
): number | null => {
  const [cursor, setCursor] = useState<number | null>(null);
  const edge = useRef(newest);
  edge.current = newest;
  const cur = useRef(cursor);
  cur.current = cursor;
  useEffect(() => {
    if (cursor == null && newest != null) setCursor(newest - lead);
  }, [cursor, newest, lead]);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const c = cur.current;
      const e = edge.current;
      let wait = slotMs;
      if (c != null && e != null) {
        const gap = e - c;
        if (gap > JUMP) setCursor(e - lead);
        else if (gap > 0) {
          setCursor(c + 1);
          wait = slotMs * Math.min(PACE_MAX, Math.max(PACE_MIN, lead / gap));
        }
      }
      t = setTimeout(tick, wait);
    };
    t = setTimeout(tick, slotMs);
    return () => clearTimeout(t);
  }, [slotMs, lead]);
  return cursor;
};

export default usePlayhead;
