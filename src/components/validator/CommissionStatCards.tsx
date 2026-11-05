import PageSkeleton from 'components/common/PageSkeleton';
import StatCard from 'components/common/StatCard';
import WarningBanner from 'components/common/WarningBanner';
import useCluster from 'hooks/useCluster';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { VoteAccountChange } from 'providers/vortex-schemas';
import { useContext, useEffect } from 'react';
import { Col, Row } from 'react-bootstrap';

// The changes it's judged on: its last WINDOW epochs (the current one in).
const WINDOW = 10;
// Changed in this many of them: "changes its commission often".
const OFTEN_EPOCHS = 3;
// Inflation commission only (block revenue's isn't shown yet).
const KINDS = ['inflationCommission'];

const pct = (b: number | null | undefined) =>
  b == null ? '—' : `${(b / 100).toLocaleString('en-US')}%`;
const num = (v: unknown) =>
  typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;

/** Its commission changes (rate changes only: re-setting the same rate
 *  isn't one), oldest first. */
const commissionChanges = (events: VoteAccountChange[] | undefined) =>
  (events ?? []).filter(
    e => KINDS.includes(e.kind) && num(e.oldValue) !== num(e.newValue)
  );

/**
 * The top of the Earnings tab: its commissions - inflation (the rate in
 * effect, from its vote account, and a scheduled change), MEV (Jito's,
 * the latest epoch's) - and how often it changes its inflation
 * commission, over its last 10 epochs. Changing it in 3+ of them warns: the
 * rate a wallet reads at one moment may not be the one its delegators
 * are charged.
 */
const CommissionStatCards = ({ identity }: { identity: string }) => {
  const context = useContext(VortexDataContext);
  const { isTestnet } = useCluster();
  const fetchStatus = context?.validatorStatusState.fetchData;
  const fetchChanges = context?.validatorVoteAccountChangesState.fetchData;
  useEffect(() => {
    fetchStatus?.(identity);
    fetchChanges?.(identity);
  }, [identity, fetchStatus, fetchChanges]);
  const status = context?.validatorStatusState.data.get(identity);
  const statusFailed =
    !status &&
    !!context?.validatorStatusState.error &&
    !context.validatorStatusState.isLoading;
  const changes = context?.validatorVoteAccountChangesState.data.get(identity);
  const earnings = context?.epochEarningsState.data.get(identity);
  const currentEpoch = context?.currentEpochState.epoch ?? null;

  // Nothing to show without its vote account (the API down): no cards.
  if (statusFailed) return null;
  const changesFailed =
    !changes &&
    !!context?.validatorVoteAccountChangesState.error &&
    !context.validatorVoteAccountChangesState.isLoading;
  if (
    !status ||
    (!isTestnet && !earnings) ||
    (!changes && !changesFailed) ||
    currentEpoch == null
  )
    return <PageSkeleton rows={[{ stats: 3 }]} />;

  const vs = status.voteState;
  // The rate in effect now: a scheduled change's `effective` (the
  // runtime pays from an earlier snapshot), else the account's.
  const rate = (key: 'inflationRewardsCommissionBps') => {
    const p = vs?.pending?.[key];
    const now = p ? num(p.effective) : (vs?.[key] ?? null);
    const next = p ? num(p.later?.value ?? p.next) : null;
    const from = p ? (p.later?.fromEpoch ?? p.fromEpoch) : null;
    return {
      now: now != null && !Number.isNaN(now) ? now : null,
      sub:
        next != null && !Number.isNaN(next)
          ? `${pct(next)} from ${from != null ? `epoch ${from}` : 'a coming epoch'}`
          : 'on its vote account'
    };
  };
  const inflation = rate('inflationRewardsCommissionBps');

  // MEV: the latest epoch's Jito rate.
  const latest = earnings?.length ? earnings[earnings.length - 1] : undefined;
  const mev = latest?.rates;
  const noTips = mev?.mevCommissionBpsSource === 'noTipAccount';

  const recent = changes
    ? commissionChanges(changes.events).filter(
        e => e.epoch > currentEpoch - WINDOW
      )
    : null;
  const epochsWith = new Set(recent?.map(e => e.epoch)).size;
  const often = epochsWith >= OFTEN_EPOCHS;
  const values = (recent ?? []).flatMap(e => [
    num(e.oldValue),
    num(e.newValue)
  ]);
  const lo = values.length ? Math.min(...values) : null;
  const hi = values.length ? Math.max(...values) : null;

  return (
    <div>
      {often && recent && (
        <WarningBanner icon="alert-triangle">
          Changes its commission often: {recent.length.toLocaleString()} times
          in {epochsWith} of its last {WINDOW} epochs, between {pct(lo)} and{' '}
          {pct(hi)}. The rate on its vote account at one moment may not be the
          one its delegators are charged - Inflation Rewards below has what each
          epoch charged.
        </WarningBanner>
      )}
      <Row className="g-3">
        <Col xs={12} sm={4}>
          <StatCard
            label="Inflation Commission"
            value={pct(inflation.now)}
            sublabel={inflation.sub}
          />
        </Col>
        <Col xs={12} sm={4}>
          <StatCard
            label="MEV Commission"
            value={isTestnet || noTips ? '—' : pct(mev?.mevCommissionBps)}
            sublabel={
              isTestnet
                ? 'no Jito on testnet'
                : noTips
                  ? 'no Jito tip account'
                  : mev?.mevCommissionBpsSource === 'previousEpoch'
                    ? `Jito's, epoch ${latest!.epoch - 1}'s`
                    : `Jito's, epoch ${latest?.epoch ?? '—'}`
            }
          />
        </Col>
        <Col xs={12} sm={4}>
          <StatCard
            label="Commission Changes"
            value={recent ? recent.length.toLocaleString() : '—'}
            tone={often ? 'warning' : undefined}
            sublabel={
              !recent
                ? 'not available right now'
                : recent.length
                  ? `last ${WINDOW} epochs · ${pct(lo)}–${pct(hi)}`
                  : `none in its last ${WINDOW} epochs`
            }
          />
        </Col>
      </Row>
    </div>
  );
};

export default CommissionStatCards;
