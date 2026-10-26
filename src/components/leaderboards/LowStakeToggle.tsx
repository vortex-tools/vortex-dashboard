import { LOW_STAKE_SLOTS } from 'helpers/consensusBoards';
import { Form } from 'react-bootstrap';

/** "Hide low stake (N)" switch beside a consensus leaderboard's search. */
const LowStakeToggle = ({
  hide,
  onChange,
  count
}: {
  hide: boolean;
  onChange: (v: boolean) => void;
  /** How many validators it hides. */
  count: number;
}) => (
  <span
    title={`Validators whose stake schedules fewer than ${LOW_STAKE_SLOTS} leader slots an epoch: a handful of slots can score perfect by luck. Ranks are among the validators shown.`}
  >
    <Form.Check
      type="switch"
      id="consensus-hide-low-stake"
      label={`Hide low stake (${count.toLocaleString()})`}
      checked={hide}
      onChange={e => onChange(e.target.checked)}
      className="mb-0"
    />
  </span>
);

export default LowStakeToggle;
