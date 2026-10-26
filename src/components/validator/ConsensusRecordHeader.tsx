import FeatherIcon from 'feather-icons-react';
import Button from 'components/base/Button';
import ValidatorPageHeader, {
  validatorTabPath
} from 'components/validator/ValidatorPageHeader';
import { Form } from 'react-bootstrap';
import { useNavigate } from 'react-router';

/** The record's two pages: the validator's Voting and Production tabs. */
export type RecordPage = 'votes' | 'blocks';

const TAB = { votes: 'voting', blocks: 'production' } as const;

/** A validator's Voting or Production tab, at an epoch (null: current). */
export const recordPath = (
  address: string,
  epoch: number | null,
  page: RecordPage = 'votes'
) => validatorTabPath(address, TAB[page], epoch);

/**
 * The Voting / Production tabs' header: the validator page header, with
 * the epoch picker (previous / epoch / next, keeping the tab) in the tab
 * bar.
 */
const ConsensusRecordHeader = ({
  address,
  name,
  nodeAddress,
  epoch,
  currentEpoch,
  cutoverEpoch,
  page
}: {
  address: string;
  name: string;
  nodeAddress?: string | null;
  epoch: number | null;
  currentEpoch: number | null;
  cutoverEpoch: number | null;
  page: RecordPage;
}) => {
  const navigate = useNavigate();
  const go = (e: number) => navigate(recordPath(address, e, page));
  const epochOptions: number[] = [];
  if (cutoverEpoch != null && currentEpoch != null)
    for (let e = currentEpoch; e >= cutoverEpoch; e--) epochOptions.push(e);
  const picker = (
    <div className="d-flex align-items-center gap-2">
      <Button
        variant="soft-secondary"
        className="btn-sm"
        disabled={
          epoch == null || cutoverEpoch == null || epoch <= cutoverEpoch
        }
        onClick={() => epoch != null && go(epoch - 1)}
        aria-label="Previous epoch"
      >
        <FeatherIcon icon="chevron-left" size={14} />
      </Button>
      <Form.Select
        size="sm"
        value={epoch ?? ''}
        onChange={e => go(Number(e.target.value))}
        aria-label="Epoch"
        className="w-auto"
      >
        {epochOptions.map(e => (
          <option key={e} value={e}>
            Epoch {e}
            {e === currentEpoch ? ' (current)' : ''}
          </option>
        ))}
      </Form.Select>
      <Button
        variant="soft-secondary"
        className="btn-sm"
        disabled={
          epoch == null || currentEpoch == null || epoch >= currentEpoch
        }
        onClick={() => epoch != null && go(epoch + 1)}
        aria-label="Next epoch"
      >
        <FeatherIcon icon="chevron-right" size={14} />
      </Button>
    </div>
  );
  return (
    <ValidatorPageHeader
      address={address}
      name={name}
      nodeAddress={nodeAddress}
      tab={TAB[page]}
      epoch={epoch}
      toolbar={picker}
    />
  );
};

export default ConsensusRecordHeader;
