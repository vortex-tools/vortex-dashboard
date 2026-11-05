/**
 * Slot numbers: with commas, except in tables, where SlotNumber sets the
 * digit groups slightly apart instead (columns of slots scan better).
 *
 * No imports: the Worker can bundle it.
 */

/** 465602945 -> ['465', '602', '945']. */
export const slotGroups = (slot: number): string[] => {
  const s = String(Math.trunc(slot));
  const head = s.length % 3 || 3;
  const out = [s.slice(0, head)];
  for (let i = head; i < s.length; i += 3) out.push(s.slice(i, i + 3));
  return out;
};

/** A slot number as plain text (titles, chart tooltips): with commas.
 *  For JSX use <SlotNumber>: commas too, a slight gap inside tables. */
export const slotText = (slot: number) =>
  Math.trunc(slot).toLocaleString('en-US');
