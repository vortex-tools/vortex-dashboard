import { slotText } from 'helpers/slot';

/** A slot number: bare digits, no commas (it's an identifier), on one
 *  line. */
const SlotNumber = ({ slot }: { slot: number }) => (
  <span className="vx-slot">{slotText(slot)}</span>
);

export default SlotNumber;
