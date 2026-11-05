import PageSkeleton from 'components/common/PageSkeleton';
import StatCard from 'components/common/StatCard';
import WarningBanner from 'components/common/WarningBanner';
import { formatLamports } from 'helpers/utils';
import useCluster from 'hooks/useCluster';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { VoteAccountChange } from 'providers/vortex-schemas';
import { useContext, useEffect } from 'react';
import { Col, Row } from 'react-bootstrap';

// The changes it's judged on: its last WINDOW epochs (the current one in).
const WINDOW = 10;
// Changed in this many of them: "changes its commission often".
const OFTEN_EPOCHS = 3;
// Net On-chain Revenue: summed over this many finished epochs.
const NET_EPOCHS = 10;
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
 * effect, from its vote account, and a scheduled change) and MEV (Jito's,
 * the latest epoch's) - under a warning when it changes its inflation
 * commission often: in 3+ of its last 10 epochs. The rate a wallet reads
 * at one moment may not be the one its delegators are charged.
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
    return <PageSkeleton rows={[{ stats: 4 }]} />;

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
  // Per epoch, over the finished epochs with a net (the chart's): what it
  // took in - commissions, block revenue, MEV, SFDP, BAM Boost - and that
  // less what it paid on chain (VAT, vote fees).
  const paid = (earnings ?? []).filter(r => r.net != null);
  const mean = (f: (r: (typeof paid)[number]) => number) =>
    paid.length ? paid.reduce((a, r) => a + f(r), 0) / paid.length : null;
  const avgIncome = mean(r => (r.net ?? 0) + r.costs.voteFees + r.costs.vat);
  // Net: summed over its last NET_EPOCHS finished epochs.
  const lastPaid = paid.slice(-NET_EPOCHS);
  const net = lastPaid.length
    ? lastPaid.reduce((a, r) => a + (r.net ?? 0), 0)
    : null;
  const costs = lastPaid.reduce(
    (a, r) => a + r.costs.voteFees + r.costs.vat,
    0
  );
  const sol = (l: number | null) => (l == null ? '—' : formatLamports(l, 3));
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
        {!isTestnet && (
          <>
            <Col xs={6} xl={3}>
              <StatCard
                label="Avg Earnings / Epoch"
                value={sol(avgIncome)}
                sublabel={
                  paid.length
                    ? `before costs · last ${paid.length} epochs`
                    : 'no finished epochs yet'
                }
              />
            </Col>
            <Col xs={6} xl={3}>
              <StatCard
                label="Net On-chain Revenue"
                value={sol(net)}
                tone={net != null && net < 0 ? 'danger' : undefined}
                sublabel={
                  lastPaid.length
                    ? `last ${lastPaid.length} epochs, after ${sol(costs)} VAT and fees`
                    : 'no finished epochs yet'
                }
              />
            </Col>
          </>
        )}
        <Col xs={6} xl={isTestnet ? 6 : 3}>
          <StatCard
            label="Inflation Commission"
            value={pct(inflation.now)}
            sublabel={inflation.sub}
          />
        </Col>
        <Col xs={6} xl={isTestnet ? 6 : 3}>
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
      </Row>
    </div>
  );
};

export default CommissionStatCards;
