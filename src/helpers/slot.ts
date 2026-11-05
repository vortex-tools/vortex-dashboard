/**
 * Slot numbers: bare digits, no commas - a slot is an identifier, not an
 * amount, and the commas pulled the eye. Counts of slots keep their
 * commas. One place to change how slots read.
 *
 * No imports: the Worker can bundle it.
 */

/** A slot number as text: "465602945". */
export const slotText = (slot: number) => String(Math.trunc(slot));
