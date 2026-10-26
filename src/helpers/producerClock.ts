import { ProducerLeaderboardRecord } from 'providers/vortex-schemas';

// Half or more of its blocks clamped (vortex-data's suggestion), over at
// least a window's worth.
const SHARE = 0.5;
const MIN_BLOCKS = 4;

/**
 * Whether a producer's clock is off, from how its blocks' times were
 * clamped (SIMD-0363: a block's time is held in [parent + 1 ns, a ceiling
 * of 2 x slot time per slot]). Mostly at the floor: its clock is behind
 * the cluster; mostly at the ceiling (independent of others' floors):
 * ahead. No ms offset - a clamped time hides how far off the clock is.
 */
export const clockVerdict = (
  r: ProducerLeaderboardRecord | undefined | null
): { kind: 'behind' | 'ahead'; clamped: number; of: number } | null => {
  const of = r?.clockBlocks ?? 0;
  if (of < MIN_BLOCKS) return null;
  const floor = r?.clockFloorBlocks ?? 0;
  const ceiling = r?.clockCeilingBlocks ?? 0;
  if (floor / of >= SHARE) return { kind: 'behind', clamped: floor, of };
  if (ceiling / of >= SHARE) return { kind: 'ahead', clamped: ceiling, of };
  return null;
};

/** "Its clock is behind the cluster: 200 of 200 blocks this epoch ..." */
export const clockLine = (v: NonNullable<ReturnType<typeof clockVerdict>>) =>
  v.kind === 'behind'
    ? `Its clock is behind the cluster: ${v.clamped.toLocaleString()} of ${v.of.toLocaleString()} blocks had their time clamped to parent + 1 ns. Check NTP.`
    : `Its clock is ahead of the cluster: ${v.clamped.toLocaleString()} of ${v.of.toLocaleString()} blocks had their time clamped to the ceiling. Check NTP.`;

export const CLOCK_DETAIL =
  "Each block carries its producer's clock time, held by the protocol (SIMD-0363) between parent + 1 ns and a ceiling of twice the slot time per slot. A producer whose blocks keep landing on a bound has a clock that is off - it doesn't cost rewards, but it skews block times and finalization-lag readings for its slots.";
