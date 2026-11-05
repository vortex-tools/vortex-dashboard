import UntrackedState from 'components/common/UntrackedState';
import PageSkeleton, { SKELETON } from 'components/common/PageSkeleton';
import StakingStatCards from 'components/validator/StakingStatCards';
import { VortexDataContext } from 'providers/VortexDataProvider';
import DelegatorsCards from 'components/validator/DelegatorsCards';
import StakeChangesCards from 'components/validator/StakeChangesCards';
import ValidatorPageHeader from 'components/validator/ValidatorPageHeader';
import { ValidatorSfdpBox } from 'components/validator/ValidatorStatus';
import useCluster from 'hooks/useCluster';
import useConsensus from 'hooks/useConsensus';
import useValidatorIdentity from 'hooks/useValidatorIdentity';
import { useContext } from 'react';
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
  // The API down: say so (nothing would load).
  const { unavailable } = useConsensus();
  const identity = useValidatorIdentity(address);
  const nodeAddress =
    identity && identity.source !== 'fallback' ? identity.nodeAddress : null;
  // Not resolved yet while the directory loads: the page's shape pulsing.
  const directory = useContext(VortexDataContext)?.validatorDirectoryState;
  const statusSlice = useContext(VortexDataContext)?.validatorStatusState;
  const status = nodeAddress ? statusSlice?.data.get(nodeAddress) : undefined;
  const statusFailed = !!statusSlice?.error && !statusSlice.isLoading;
  const settled = !!status || statusFailed;
  const resolving =
    !nodeAddress && directory?.validators == null && directory?.error == null;
  return (
    <div>
      <ValidatorPageHeader
        address={address}
        name={identity?.displayName ?? 'Validator'}
        nodeAddress={nodeAddress}
        tab="staking"
      />
      <div className="mb-9">
        {unavailable ? (
          <UntrackedState>The API is unavailable right now.</UntrackedState>
        ) : resolving ? (
          <PageSkeleton rows={SKELETON.staking} />
        ) : isTestnet ? (
          <UntrackedState>
            Testnet stake is delegated by the foundation, so its changes
            aren&apos;t tracked.
          </UntrackedState>
        ) : (
          nodeAddress && (
            // Until its status is in (which decides the SFDP card above the
            // rest), the tab's placeholder; the cards load meanwhile,
            // unseen at full width, so they land all at once, in place.
            <div className="position-relative">
              {!settled && <PageSkeleton rows={SKELETON.staking} />}
              <div
                className="d-flex flex-column gap-3"
                aria-hidden={!settled || undefined}
                style={
                  settled
                    ? undefined
                    : {
                        position: 'absolute',
                        inset: '0 0 auto 0',
                        visibility: 'hidden'
                      }
                }
              >
                <StakingStatCards identity={nodeAddress} />
                {/* SFDP's status and delegation (only for participants). */}
                <ValidatorSfdpBox nodeAddress={nodeAddress} />
                <DelegatorsCards identity={nodeAddress} />
                <StakeChangesCards identity={nodeAddress} />
                <DelegatorsCards identity={nodeAddress} part="sizes" />
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default ValidatorStaking;
