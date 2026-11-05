import { slotGroups } from 'helpers/slot';

/**
 * A slot number in groups of three digits: commas between them, or in a
 * table a slight gap (user.scss). Both are drawn by CSS, so copying it
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
