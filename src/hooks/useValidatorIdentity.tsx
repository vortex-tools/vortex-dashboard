import { useContext, useMemo } from 'react';
import {
  IDEAL_RECORD_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';

const truncateAddress = (addr: string) =>
  addr.length <= 16 ? addr : `${addr.slice(0, 6)}…${addr.slice(-6)}`;

export interface ValidatorIdentity {
  nodeAddress: string;
  voteAddress: string;
  displayName: string;
  /** Which source resolved this identity, useful for debugging. */
  source: 'leaderboard' | 'directory' | 'fallback';
}

/**
 * Resolve a validator's canonical identity from a URL address param.
 * Priority:
 *   1. Current-epoch voting leaderboard record (carries both addresses + name).
 *   2. Validator directory dump (POST /validators).
 *   3. URL fallback — echoes the input address for both fields so consumers
 *      can render something (e.g. breadcrumbs) even when no data is loaded.
 *
 * Returns `undefined` if the address arg is empty/undefined.
 */
const useValidatorIdentity = (
  address: string | undefined
): ValidatorIdentity | undefined => {
  const context = useContext(VortexDataContext);
  const currentEpoch = context?.currentEpochState.epoch ?? null;

  return useMemo(() => {
    if (!context || !address) return undefined;

    if (currentEpoch !== null) {
      const lb = context.epochVoteLeaderboardState.data.get(currentEpoch);
      const record = lb?.records.find(
        r =>
          r.voteAddress !== IDEAL_RECORD_KEY &&
          (r.voteAddress === address || r.nodeAddress === address)
      );
      if (record) {
        return {
          nodeAddress: record.nodeAddress,
          voteAddress: record.voteAddress,
          displayName: record.nodeName || truncateAddress(record.nodeAddress),
          source: 'leaderboard'
        };
      }
    }

    const dir = context.validatorDirectoryState;
    const dirEntry =
      dir.byNodeAddress.get(address) || dir.byVoteAddress.get(address);
    if (dirEntry) {
      return {
        nodeAddress: dirEntry.nodeAddress,
        voteAddress: dirEntry.voteAddress || address,
        displayName: dirEntry.name || truncateAddress(dirEntry.nodeAddress),
        source: 'directory'
      };
    }

    return {
      nodeAddress: address,
      voteAddress: address,
      displayName: truncateAddress(address),
      source: 'fallback'
    };
  }, [context, currentEpoch, address]);
};

export default useValidatorIdentity;
