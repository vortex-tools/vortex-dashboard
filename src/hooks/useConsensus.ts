import { useContext } from 'react';
import { IS_TESTNET_SITE } from 'helpers/apiEndpoint';
import { VortexDataContext } from 'providers/VortexDataProvider';

export interface ConsensusInfo {
  /** Alpenglow is active: epochs >= cutoverEpoch are Alpenglow. */
  alpenglowActive: boolean;
  /** First Alpenglow epoch (the epoch containing the genesis slot). */
  cutoverEpoch: number | null;
  /** 'scheduled' | 'migrating' | 'active', or null (nothing scheduled). */
  phase: string | null;
  /** Last Tower epoch while Alpenglow is active (cutoverEpoch - 1). */
  lastTowerEpoch: number | null;
  /** /epochs/current has answered (the status above is real). */
  known: boolean;
  /** /epochs/current failed: the API is unavailable. Never read this as
   *  "Tower". */
  unavailable: boolean;
}

/** Each cluster's first Alpenglow epoch: both have migrated. */
const CUTOVER_EPOCH = { mainnet: 1064, testnet: 1042 } as const;

/**
 * Both clusters run Alpenglow (mainnet from epoch 1064, testnet from
 * 1042), so this no longer asks the API: Alpenglow participation is the
 * current product and the Tower vote views are historical (capped at
 * cutoverEpoch - 1). The cluster (for its cutover) is the API's.
 */
const useConsensus = (): ConsensusInfo => {
  const state = useContext(VortexDataContext)?.currentEpochState;
  // Until /epochs/current names the cluster, the build's (testnet.vx.tools
  // is testnet; staging's API selector can point anywhere).
  const testnet =
    (state?.cluster ?? (IS_TESTNET_SITE ? 'testnet' : null)) === 'testnet';
  const cutoverEpoch = testnet ? CUTOVER_EPOCH.testnet : CUTOVER_EPOCH.mainnet;
  return {
    alpenglowActive: true,
    cutoverEpoch,
    phase: 'active',
    lastTowerEpoch: cutoverEpoch - 1,
    known: true,
    unavailable: state?.epoch == null && !!state?.error
  };
};

export default useConsensus;
