import BlockIncomeSection from 'components/validator/BlockIncomeSection';
import UntrackedState from 'components/common/UntrackedState';
import useConsensus from 'hooks/useConsensus';
import ValidatorPageHeader from 'components/validator/ValidatorPageHeader';
import useValidatorIdentity from 'hooks/useValidatorIdentity';
import { useParams } from 'react-router';

/**
 * A validator's Fees tab: the fees and tips its blocks earned, per epoch
 * (the Tower block-ingestor's block income), against the cluster's.
 */
const ValidatorFees = () => {
  const { address = '' } = useParams();
  const identity = useValidatorIdentity(address);
  // The API down: say so (nothing would load).
  const { unavailable } = useConsensus();
  const nodeAddress =
    identity && identity.source !== 'fallback' ? identity.nodeAddress : null;
  return (
    <div>
      <ValidatorPageHeader
        address={address}
        name={identity?.displayName ?? 'Validator'}
        nodeAddress={nodeAddress}
        tab="fees"
      />
      <div className="mb-9">
        {unavailable ? (
          <UntrackedState>The API is unavailable right now.</UntrackedState>
        ) : (
          nodeAddress && <BlockIncomeSection nodeAddress={nodeAddress} />
        )}
      </div>
    </div>
  );
};

export default ValidatorFees;
