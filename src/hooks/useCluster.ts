import { useContext } from 'react';
import { VortexDataContext } from 'providers/VortexDataProvider';

/** Empty-state copy wherever block-derived data is missing on testnet. */
export const BLOCK_INCOME_UNTRACKED = "Block income isn't tracked on testnet.";

/**
 * The cluster the API serves, from /epochs/current (never the hostname).
 * Testnet has no block ingestion by design: block
 * income, earnings' block rewards and block insights are empty there, so
 * pages say so instead of showing zeros.
 */
const useCluster = () => {
  const cluster =
    useContext(VortexDataContext)?.currentEpochState.cluster ?? null;
  const isTestnet = cluster === 'testnet';
  return { cluster, isTestnet, blockIncomeTracked: !isTestnet };
};

export default useCluster;
