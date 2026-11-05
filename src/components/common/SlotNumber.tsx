import { slotGroups } from 'helpers/slot';

/**
 * A slot number, its digits in groups of three with a slight gap between
 * them (no commas: it's an identifier). The gap is a margin, so copying it
 * gives the bare number, ready to paste into an explorer or an RPC call.
 */
const SlotNumber = ({ slot }: { slot: number }) => (
  <span className="vx-slot">
    {slotGroups(slot).map((g, i) => (
      <span key={i} className={i ? 'vx-slot-group' : undefined}>
        {g}
      </span>
    ))}
  </span>
);

export default SlotNumber;
