/**
 * Slot numbers: no commas - a slot is an identifier, not an amount, and
 * the commas pulled the eye (counts of slots keep theirs). In tables,
 * SlotNumber sets the digit groups slightly apart.
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

/** A slot number as plain text (titles, chart tooltips): bare digits.
 *  For JSX use <SlotNumber>, which groups digits inside tables. */
export const slotText = (slot: number) => String(Math.trunc(slot));
