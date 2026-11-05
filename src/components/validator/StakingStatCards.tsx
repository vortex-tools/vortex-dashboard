import { StatsSkeleton } from 'components/common/PageSkeleton';
import StatCard from 'components/common/StatCard';
import { formatLamports } from 'helpers/utils';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useEffect } from 'react';
import { Col, Row } from 'react-bootstrap';

const pct = (x: number | null | undefined) =>
  x == null
    ? '—'
    : `${(x * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const sol = (lamports: number) => formatLamports(lamports, 0);
const signed = (lamports: number) =>
  `${lamports > 0 ? '+' : lamports < 0 ? '−' : ''}${sol(Math.abs(lamports))}`;

/**
 * The top of the Staking tab: its active stake (and share of the
 * cluster's), the change waiting for the next epoch (stake activating less
 * deactivating, a chain read), how many stake here (withdraw authorities,
 * and stake accounts), and how much of it stake pools hold (the latest
 * completed epoch's holdings). Reads the slices the tab's cards use; fetches
 * the ones they don't.
 */
const StakingStatCards = ({ identity }: { identity: string }) => {
  const context = useContext(VortexDataContext);
  const fetchStatus = context?.validatorStatusState.fetchData;
  const fetchStake = context?.validatorStakeState.fetchData;
  const fetchDelegators = context?.delegatorsState.fetchData;
  const fetchChanges = context?.stakeChangesState.fetchData;
  useEffect(() => {
    fetchStatus?.(identity);
    fetchStake?.(identity);
    fetchDelegators?.(identity);
    fetchChanges?.(identity);
  }, [identity, fetchStatus, fetchStake, fetchDelegators, fetchChanges]);
  const status = context?.validatorStatusState.data.get(identity);
  const stake = context?.validatorStakeState.data.get(identity);
  const d = context?.delegatorsState.data.get(identity);
  const items = context?.stakeChangesState.data.get(identity);
  const failed = (s?: { error: string | null; isLoading: boolean }) =>
    !!s?.error && !s.isLoading;

  // Its place until the cards' main reads are in (or failed).
  if (
    (!status && !failed(context?.validatorStatusState)) ||
    (!d && !failed(context?.delegatorsState))
  )
    return <StatsSkeleton count={4} className="g-3" />;

  const active = status?.stake.activatedStake ?? d?.stake ?? null;
  const net = stake ? stake.activatingStake - stake.deactivatingStake : null;
  const latest = items?.length ? items[items.length - 1] : undefined;
  const pooled = latest
    ? latest.pools.reduce((a, p) => a + p.lamports, 0)
    : null;

  return (
    <Row className="g-3">
      <Col xs={6} md>
        <StatCard
          label="Active Stake"
          value={active != null ? sol(active) : '—'}
          sublabel={
            status?.stake.shareOfTotal != null
              ? `${pct(status.stake.shareOfTotal)} of stake`
              : undefined
          }
        />
      </Col>
      <Col xs={6} md>
        <StatCard
          label="Next Epoch"
          value={net != null ? signed(net) : '—'}
          sublabel={
            stake
              ? `+${sol(stake.activatingStake)} in · −${sol(stake.deactivatingStake)} out`
              : 'reading the chain…'
          }
        />
      </Col>
      <Col xs={6} md>
        <StatCard
          label="Stakers"
          value={d ? d.delegators.toLocaleString() : '—'}
          sublabel={
            d?.stakeAccounts != null
              ? `${d.stakeAccounts.toLocaleString()} stake accounts`
              : undefined
          }
        />
      </Col>
      <Col xs={6} md>
        <StatCard
          label="From Pools"
          value={
            pooled != null && latest?.stakeAfter
              ? pct(pooled / latest.stakeAfter)
              : '—'
          }
          sublabel={
            latest
              ? `${latest.pools.length.toLocaleString()} pool${latest.pools.length === 1 ? '' : 's'} · epoch ${latest.epoch}`
              : 'of its stake'
          }
        />
      </Col>
    </Row>
  );
};

export default StakingStatCards;
