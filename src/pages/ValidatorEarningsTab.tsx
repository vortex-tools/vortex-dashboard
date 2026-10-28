import DelayedSpinner from 'components/common/DelayedSpinner';
import SectionCard from 'components/common/SectionCard';
import InflationRewardsTable from 'components/validator/InflationRewardsTable';
import ValidatorEarnings from 'components/validator/ValidatorEarnings';
import ValidatorPageHeader from 'components/validator/ValidatorPageHeader';
import useCluster from 'hooks/useCluster';
import useConsensus from 'hooks/useConsensus';
import useLiveRefresh from 'hooks/useLiveRefresh';
import useValidatorIdentity from 'hooks/useValidatorIdentity';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useEffect } from 'react';
import { Col, Row } from 'react-bootstrap';
import { useParams } from 'react-router';

const REFRESH_MS = 60_000;

/**
 * A validator's Earnings tab: net earnings over time (inflation commission,
 * block revenue and MEV, less costs), then its inflation rewards per
 * epoch (Alpenglow: voting and production, the current epoch so far;
 * Tower before it). Block income is the Fees tab, stake the Staking tab.
 */
const ValidatorEarningsTab = () => {
  const { address = '' } = useParams();
  const context = useContext(VortexDataContext);
  const { alpenglowActive, cutoverEpoch } = useConsensus();
  const { isTestnet } = useCluster();
  const identity = useValidatorIdentity(address);
  const name = identity?.displayName ?? 'Validator';
  const nodeAddress =
    identity && identity.source !== 'fallback' ? identity.nodeAddress : null;
  const currentEpoch = context?.currentEpochState.epoch ?? null;

  // Per-epoch rewards: the URL's address works as the voteKey.
  const slice = context?.epochParticipationState;
  const fetchRewards = slice?.fetchData;
  const rows = address ? slice?.data.get(address) : undefined;
  useEffect(() => {
    if (alpenglowActive && address) fetchRewards?.(address);
  }, [alpenglowActive, address, fetchRewards]);
  // The current epoch's row grows: refresh it while the tab is open.
  useLiveRefresh(alpenglowActive && !!address, REFRESH_MS, () =>
    fetchRewards?.(address, { force: true })
  );
  // Earlier (Tower) epochs: the commission the vote account was paid,
  // from /epochs/earnings (the Earnings chart's data, shared).
  const earningsSlice = context?.epochEarningsState;
  const fetchEarnings = earningsSlice?.fetchData;
  const earnings = nodeAddress
    ? earningsSlice?.data.get(nodeAddress)
    : undefined;
  const withEarnings = !isTestnet && !!nodeAddress;
  useEffect(() => {
    if (withEarnings) fetchEarnings?.(nodeAddress!);
  }, [withEarnings, nodeAddress, fetchEarnings]);
  const rewardsLoading =
    (alpenglowActive && rows === undefined) ||
    (withEarnings && earnings === undefined);

  return (
    <div>
      <ValidatorPageHeader
        address={address}
        name={name}
        nodeAddress={nodeAddress}
        tab="earnings"
      />
      {/* Side by side on large screens. */}
      <Row className="mb-9 g-3">
        {nodeAddress && !isTestnet && (
          <Col xs={12} lg={6}>
            <ValidatorEarnings nodeAddress={nodeAddress} />
          </Col>
        )}
        {(alpenglowActive || withEarnings) && (
          <Col xs={12} lg={isTestnet ? 12 : 6}>
            <SectionCard
              title="Inflation Rewards"
              icon="award"
              info="Rewards before commission, per epoch: Voting and Production (Alpenglow), and what missed votes didn't earn. The current epoch is so far, its commission estimated (≈)."
            >
              {rewardsLoading ? (
                <DelayedSpinner loading label="Loading rewards…" />
              ) : (
                <InflationRewardsTable
                  rows={rows ?? []}
                  earnings={earnings}
                  cutoverEpoch={cutoverEpoch}
                  address={address}
                  currentEpoch={currentEpoch}
                />
              )}
            </SectionCard>
          </Col>
        )}
      </Row>
    </div>
  );
};

export default ValidatorEarningsTab;
