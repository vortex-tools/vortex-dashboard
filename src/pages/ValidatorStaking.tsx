import UntrackedState from 'components/common/UntrackedState';
import DelegatorsCards from 'components/validator/DelegatorsCards';
import StakeChangesCards from 'components/validator/StakeChangesCards';
import ValidatorPageHeader from 'components/validator/ValidatorPageHeader';
import { ValidatorSfdpBox } from 'components/validator/ValidatorStatus';
import useCluster from 'hooks/useCluster';
import useValidatorIdentity from 'hooks/useValidatorIdentity';
import { useParams } from 'react-router';

/**
 * A validator's Staking tab: who stakes to it (stake sizes, top stakers),
 * stake moving in and out over completed epochs, and each known pool's
 * holdings. Mainnet only - testnet stake is
 * delegated by the foundation, not moved by stakers.
 */
const ValidatorStaking = () => {
  const { address = '' } = useParams();
  const { isTestnet } = useCluster();
  const identity = useValidatorIdentity(address);
  const nodeAddress =
    identity && identity.source !== 'fallback' ? identity.nodeAddress : null;
  return (
    <div>
      <ValidatorPageHeader
        address={address}
        name={identity?.displayName ?? 'Validator'}
        nodeAddress={nodeAddress}
        tab="staking"
      />
      <div className="mb-9">
        {isTestnet ? (
          <UntrackedState>
            Testnet stake is delegated by the foundation, so its changes
            aren&apos;t tracked.
          </UntrackedState>
        ) : (
          nodeAddress && (
            <div className="d-flex flex-column gap-3">
              {/* SFDP's status and delegation (only for participants). */}
              <ValidatorSfdpBox nodeAddress={nodeAddress} />
              <DelegatorsCards identity={nodeAddress} />
              <StakeChangesCards identity={nodeAddress} />
              <DelegatorsCards identity={nodeAddress} part="sizes" />
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default ValidatorStaking;
