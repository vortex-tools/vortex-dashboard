/**
 * Slot numbers: digits in groups of three, set apart by a small gap
 * rather than commas - a slot is an identifier, not an amount, and the
 * commas pulled the eye. Counts of slots keep their commas.
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

// A narrow no-break space: the gap in plain text (titles, chart tooltips).
const GAP = ' ';

/** A slot number as plain text: "465 602 945", narrow-spaced. For JSX use
 *  <SlotNumber>, whose gaps are margins, so a copied slot has no spaces. */
export const slotText = (slot: number) => slotGroups(slot).join(GAP);
