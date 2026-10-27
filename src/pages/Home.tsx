import EpochProgressSublabel from 'components/common/EpochProgressSublabel';
import useCluster from 'hooks/useCluster';
import useConsensus from 'hooks/useConsensus';
import FeatherIcon from 'feather-icons-react';
import StatCard from 'components/common/StatCard';
import SlotStrip from 'components/home/SlotStrip';
import WhatsNext from 'components/home/WhatsNext';
import ValidatorSearch from 'components/common/ValidatorSearch';
import { formatLamports } from 'helpers/utils';
import useRefreshOnce from 'hooks/useRefreshOnce';
import useLiveRefresh from 'hooks/useLiveRefresh';
import { formatDuration } from 'helpers/utils';
import { useEpochLive, useClusterHalt } from 'hooks/useIngestion';
import useTrailingTotals from 'hooks/useTrailingTotals';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Col, Row } from 'react-bootstrap';
import { Link } from 'react-router';
import { EpochProgress } from 'providers/vortex-schemas';
import {
  IDEAL_RECORD_KEY,
  VALIDATOR_STATUS_SUMMARY_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';

/** Don't run the estimate on further than this past the last reading. */
const SLOT_TICK_MAX_MS = 120_000;

/**
 * The cluster's current slot: /epochs/current's reading, run on at the
 * epoch's observed slot time between polls (re-anchored on each).
 */
const useTickingSlot = (progress: EpochProgress | null, halted: boolean) => {
  const [now, setNow] = useState(() => Date.now());
  const slotMs = (progress?.slotSeconds ?? 0) * 1000;
  useEffect(() => {
    if (!slotMs) return;
    const t = setInterval(() => setNow(Date.now()), Math.max(slotMs, 100));
    return () => clearInterval(t);
  }, [slotMs]);
  if (progress?.absoluteSlot == null) return null;
  // A halted cluster stays at its last slot.
  if (!slotMs || progress.readAt == null || halted)
    return progress.absoluteSlot;
  const elapsed = Math.min(
    Math.max(now - progress.readAt * 1000, 0),
    SLOT_TICK_MAX_MS
  );
  return progress.absoluteSlot + Math.floor(elapsed / slotMs);
};

const FAMILY_NAME: Record<string, string> = {
  agave: 'Agave',
  firedancer: 'Firedancer',
  frankendancer: 'Frankendancer',
  solanaLabs: 'Solana Labs',
  sig: 'Sig'
};

/** "◎437.7M". */
const compactSol = (lamports: number) => {
  const sol = lamports / 1e9;
  return sol >= 1e6
    ? `◎${(sol / 1e6).toFixed(1)}M`
    : sol >= 1e3
      ? `◎${(sol / 1e3).toFixed(1)}K`
      : `◎${Math.round(sol)}`;
};

const LeaderboardCard = ({
  title,
  description,
  linkTo,
  icon
}: {
  title: string;
  description: string;
  linkTo: string;
  icon: string;
}) => (
  <Link
    to={linkTo}
    className="d-block bg-body-emphasis rounded border border-translucent p-4 h-100 text-decoration-none text-body"
  >
    <div className="d-flex align-items-center mb-2">
      <FeatherIcon icon={icon} size={20} className="text-primary me-2" />
      <h5 className="mb-0">{title}</h5>
      <FeatherIcon
        icon="arrow-right"
        size={16}
        className="text-body-tertiary ms-auto"
      />
    </div>
    <p className="text-body-tertiary fs-9 mb-0">{description}</p>
  </Link>
);

// /epochs/current is tiny: poll it every 2 s so a new totals reading is
// picked up promptly. The counters count up to each new figure over the
// time the block figure takes to change (measured; 15 s to start).
// Without totals (older APIs) the leaderboard is re-fetched every minute.
const LIVE_POLL_MS = 2_000;
const TOTALS_REFRESH_MS = 15_000;
const KPI_REFRESH_MS = 60_000;

const Home = () => {
  const context = useContext(VortexDataContext);

  const currentEpoch = context?.currentEpochState.epoch ?? null;
  const live = useEpochLive(true, LIVE_POLL_MS);
  // Older APIs without /epochs/current.totals: the KPIs come from the
  // income leaderboard (and the status summary) instead - fetched only
  // once the first poll shows totals missing.
  const fallback = live.loaded && !live.totals;

  // Leaderboard fallback: fetch on entry (forced, since the current
  // epoch's figures move server-side), then every minute below.
  useRefreshOnce(
    fallback && currentEpoch !== null ? String(currentEpoch) : undefined,
    () => {
      if (!context) return;
      context.epochIncomeLeaderboardState.fetchData(undefined, {
        force: true
      });
    }
  );

  const { blockIncomeTracked, isTestnet } = useCluster();
  const totals =
    live.totals && live.totals.epoch === currentEpoch ? live.totals : null;
  // Counters count up to each refreshed figure over the refresh interval:
  // they trail the data, never run ahead of it.
  // Count-up pace = how often the block figure actually changes: the time
  // between readings (readAt) with a new blocksProduced. The server
  // re-reads totals every few seconds, but block data moves only when the
  // block ingestor uploads, so pacing by readAt alone would finish each
  // step early and stall. Falls back to 15 s until two changes are seen.
  const readAt = totals?.readAt ?? null;
  const readBlocks = totals?.blocksProduced ?? null;
  const [refreshGap, setRefreshGap] = useState(TOTALS_REFRESH_MS);
  const lastChange = useRef<{ at: number; blocks: number } | null>(null);
  useEffect(() => {
    if (readAt == null || readBlocks == null) return;
    const prev = lastChange.current;
    if (prev && readBlocks === prev.blocks) return;
    lastChange.current = { at: readAt, blocks: readBlocks };
    if (!prev || readBlocks < prev.blocks || readAt <= prev.at) return;
    const gap = Math.min(60_000, Math.max(1_000, (readAt - prev.at) * 1000));
    // Smooth over the ingestor's uneven upload timing.
    setRefreshGap(g => Math.round(g * 0.5 + gap * 0.5));
  }, [readAt, readBlocks]);
  const countMs = totals ? refreshGap : KPI_REFRESH_MS;
  useLiveRefresh(blockIncomeTracked && fallback, KPI_REFRESH_MS, () =>
    context?.epochIncomeLeaderboardState.fetchData(undefined, { force: true })
  );
  const { alpenglowActive } = useConsensus();

  // Active = staked and not delinquent, from the same summary as the
  // Validators page (a cluster-wide count, not just this epoch's leaders).
  const fetchSummary = context?.validatorStatusSummaryState.fetchData;
  // Stake, decentralization and the client mix come from the summary.
  useEffect(() => {
    fetchSummary?.(VALIDATOR_STATUS_SUMMARY_KEY);
  }, [fetchSummary]);
  const summary = context?.validatorStatusSummaryState.data.get(
    VALIDATOR_STATUS_SUMMARY_KEY
  );
  const active =
    live.totals?.activeValidators != null &&
    live.totals.stakedValidators != null
      ? {
          active: live.totals.activeValidators,
          staked: live.totals.stakedValidators
        }
      : summary
        ? {
            active: summary.validators.filter(v => !v.delinquent).length,
            staked: summary.validators.length
          }
        : undefined;

  // The cluster snapshot's second row, from the status summary.
  const snapshot = useMemo(() => {
    if (!summary?.validators.length) return null;
    const vs = summary.validators;
    const total = vs.reduce((a, v) => a + v.activatedStake, 0);
    if (!total) return null;
    const delinquent = vs
      .filter(v => v.delinquent)
      .reduce((a, v) => a + v.activatedStake, 0);
    // Nakamoto: the fewest validators together over a third of the stake.
    const stakes = vs.map(v => v.activatedStake).sort((a, b) => b - a);
    let sum = 0;
    let nakamoto = 0;
    for (const st of stakes) {
      if (sum > total / 3) break;
      sum += st;
      nakamoto++;
    }
    const byFamily = new Map<string, number>();
    for (const v of vs) {
      const f = v.software?.family ?? 'unknown';
      byFamily.set(f, (byFamily.get(f) ?? 0) + v.activatedStake);
    }
    const families = [...byFamily.entries()]
      .filter(([f]) => f !== 'unknown')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([f, st]) => ({ family: f, share: st / total }));
    return { total, delinquentShare: delinquent / total, nakamoto, families };
  }, [summary]);

  // Without block data (testnet), the validator KPIs come from the
  // Alpenglow participation leaderboard instead.
  const fetchParticipation = context?.participationLeaderboardState.fetchData;
  useEffect(() => {
    if (!blockIncomeTracked && alpenglowActive && currentEpoch !== null)
      fetchParticipation?.(currentEpoch);
  }, [blockIncomeTracked, alpenglowActive, currentEpoch, fetchParticipation]);
  const consensusKpis = useMemo(() => {
    if (currentEpoch === null) return undefined;
    const board = context?.participationLeaderboardState.data.get(currentEpoch);
    if (!board) return undefined;
    let stake = 0;
    let weighted = 0;
    for (const r of board.records) {
      if (!r.admitted || r.eligibleSlots === 0) continue;
      stake += r.stake;
      weighted +=
        (r.stake * (r.notarizedSlots + r.skippedSlots)) / r.eligibleSlots;
    }
    return {
      validators: board.records.length,
      admitted: board.admitted,
      participation: stake > 0 ? weighted / stake : null
    };
  }, [context, currentEpoch]);

  const kpis = useMemo(() => {
    if (!context || currentEpoch === null) return undefined;
    const incomeLb = context.epochIncomeLeaderboardState.data.get(currentEpoch);
    if (!incomeLb) return undefined;
    const realRecords = incomeLb.records.filter(
      r => r.nodeAddress !== IDEAL_RECORD_KEY
    );
    return {
      blocksProduced: realRecords.reduce((a, r) => a + r.confirmedSlots, 0),
      totalRevenue: realRecords.reduce(
        (a, r) =>
          a +
          r.totalIncome.baseFees +
          r.totalIncome.priorityFees +
          r.totalIncome.mevTips,
        0
      )
    };
  }, [context, currentEpoch]);

  const polledBlocks = totals?.blocksProduced ?? kpis?.blocksProduced ?? null;
  const polledRevenue = totals?.blockRevenue
    ? totals.blockRevenue.baseFees +
      totals.blockRevenue.priorityFees +
      totals.blockRevenue.mevTips
    : (kpis?.totalRevenue ?? null);
  const latest = useMemo(
    () =>
      polledBlocks != null
        ? { blocks: polledBlocks, revenue: polledRevenue }
        : null,
    [polledBlocks, polledRevenue]
  );
  // Blocks per second: the epoch's production rate at the observed slot
  // time - for the first load's lead-in.
  const slotSeconds = live.progress?.slotSeconds;
  const blocksPerSec =
    slotSeconds && totals?.processedSlots && totals.blocksProduced != null
      ? totals.blocksProduced / totals.processedSlots / slotSeconds
      : null;
  const trailing = useTrailingTotals(latest, countMs, blocksPerSec);
  const skipRate =
    totals?.processedSlots && totals.skippedSlots != null
      ? totals.skippedSlots / totals.processedSlots
      : null;
  const halt = useClusterHalt();
  // Halted: the halted chain's last slot (the epoch reading can show the
  // restart snapshot's slot once our node has restarted onto it).
  const tickingSlot = useTickingSlot(live.progress, !!halt);
  const currentSlot = halt ? halt.slot : tickingSlot;

  return (
    <div>
      <div className="mb-9">
        {/* Search, then the cluster at a glance. */}
        <div className="text-center pt-5 mt-3 mb-4">
          <h2 className="mb-1">Vortex</h2>
          <p className="text-body-tertiary mb-3">
            Solana validator performance, vote quality, and block income.
          </p>
          <div className="mx-auto" style={{ maxWidth: '40rem' }}>
            <ValidatorSearch />
          </div>
        </div>

        <Row className="g-3 mb-3">
          <Col xs={6} md={3}>
            <StatCard
              label="Status"
              mono={false}
              value={live.loaded ? (halt ? 'Halted' : 'Running') : '—'}
              check={live.loaded && !halt ? true : null}
              alert={!!halt}
              sublabel={
                halt
                  ? `since ${formatDuration(Date.now() / 1000 - halt.since)} ago`
                  : skipRate != null
                    ? `skip rate ${(skipRate * 100).toFixed(1)}% this epoch`
                    : undefined
              }
              linkTo="/status"
            />
          </Col>
          <Col xs={6} md={3}>
            <StatCard
              label="Current Epoch"
              value={
                currentEpoch !== null ? currentEpoch.toLocaleString() : '—'
              }
              sublabel={
                <EpochProgressSublabel
                  sources={['blocks', 'footers']}
                  live={live}
                />
              }
            />
          </Col>
          <Col xs={6} md={3}>
            <StatCard
              label="Current Slot"
              value={currentSlot != null ? currentSlot.toLocaleString() : '—'}
              sublabel={
                halt
                  ? `halted ${formatDuration(Date.now() / 1000 - halt.since)} ago`
                  : slotSeconds
                    ? `~${Math.round(slotSeconds * 1000)} ms per slot this epoch`
                    : undefined
              }
              alert={!!halt}
              linkTo="/status"
            />
          </Col>
          <Col xs={6} md={3}>
            {blockIncomeTracked ? (
              <StatCard
                label="Epoch Revenue"
                value={
                  trailing.revenue != null
                    ? formatLamports(trailing.revenue, 2)
                    : '—'
                }
                sublabel="block fees + MEV tips, so far"
                linkTo="/leaderboards/block-income"
              />
            ) : (
              <StatCard
                label="Consensus Participation"
                value={
                  consensusKpis?.participation != null
                    ? `${(consensusKpis.participation * 100).toFixed(2)}%`
                    : '—'
                }
                sublabel="of admitted stake"
                linkTo="/leaderboards/consensus"
              />
            )}
          </Col>
          <Col xs={6} md={3}>
            <StatCard
              label="Active Stake"
              value={snapshot ? compactSol(snapshot.total) : '—'}
              sublabel={
                snapshot
                  ? `${(snapshot.delinquentShare * 100).toFixed(2)}% delinquent`
                  : undefined
              }
              tone={
                snapshot && snapshot.delinquentShare > 0.05
                  ? 'warning'
                  : undefined
              }
              linkTo="/validators"
            />
          </Col>
          <Col xs={6} md={3}>
            <StatCard
              label="Validators"
              value={
                active
                  ? `${active.active.toLocaleString()} / ${active.staked.toLocaleString()}`
                  : '—'
              }
              sublabel={
                consensusKpis
                  ? `active of staked · ${consensusKpis.admitted.toLocaleString()} in consensus`
                  : 'active of staked'
              }
              linkTo="/validators"
            />
          </Col>
          <Col xs={6} md={3}>
            <StatCard
              label="Nakamoto Coefficient"
              value={snapshot ? snapshot.nakamoto.toLocaleString() : '—'}
              sublabel="fewest validators to halt consensus"
              wrapSublabel
              linkTo="/decentralization"
            />
          </Col>
          <Col xs={6} md={3}>
            <StatCard
              label="Clients"
              mono={false}
              value={
                snapshot?.families[0]
                  ? `${FAMILY_NAME[snapshot.families[0].family] ?? snapshot.families[0].family} ${Math.round(snapshot.families[0].share * 100)}%`
                  : '—'
              }
              sublabel={
                snapshot?.families[1]
                  ? `${FAMILY_NAME[snapshot.families[1].family] ?? snapshot.families[1].family} ${Math.round(snapshot.families[1].share * 100)}% of stake`
                  : 'of stake'
              }
              linkTo={isTestnet ? '/decentralization' : '/client-versions'}
            />
          </Col>
        </Row>

        <Row className="g-3 mb-3">
          <Col xs={12} lg={8}>
            <SlotStrip />
          </Col>
          <Col xs={12} lg={4}>
            <WhatsNext />
          </Col>
        </Row>

        {/* Leaderboard quick-launch. On Alpenglow clusters the consensus
            leaderboard leads (Tower voting is historical); without block
            data the income board gives way to the validators list. */}
        <Row className="g-3">
          {alpenglowActive ? (
            <>
              <Col xs={12} md={6}>
                <LeaderboardCard
                  title="Consensus Leaderboard"
                  description="Validators ranked by Alpenglow vote participation this epoch."
                  linkTo="/leaderboards/consensus"
                  icon="activity"
                />
              </Col>
              <Col xs={12} md={6}>
                {blockIncomeTracked ? (
                  <LeaderboardCard
                    title="Block Income Leaderboard"
                    description="Validators ranked by median block income this epoch."
                    linkTo="/leaderboards/block-income"
                    icon="dollar-sign"
                  />
                ) : (
                  <LeaderboardCard
                    title="Validators"
                    description="Operational status of every staked validator."
                    linkTo="/validators"
                    icon="server"
                  />
                )}
              </Col>
            </>
          ) : (
            <>
              <Col xs={12} md={6}>
                <div className="bg-body-emphasis rounded border border-translucent p-4 h-100 d-flex align-items-center gap-3">
                  <div className="flex-grow-1 min-w-0">
                    <div className="d-flex align-items-center mb-2">
                      <FeatherIcon
                        icon="bar-chart-2"
                        size={20}
                        className="text-primary me-2"
                      />
                      <h5 className="mb-0">Voting Leaderboard</h5>
                    </div>
                    <p className="text-body-tertiary fs-9 mb-0">
                      Validators ranked by vote accuracy and lag.
                    </p>
                  </div>
                  <div className="d-flex flex-column gap-2 flex-shrink-0">
                    {currentEpoch !== null && (
                      <Link
                        to={`/leaderboards/voting/epoch/${currentEpoch}`}
                        className="btn btn-sm btn-soft-primary d-inline-flex align-items-center justify-content-between"
                      >
                        Current epoch
                        <FeatherIcon
                          icon="arrow-right"
                          size={14}
                          className="ms-2"
                        />
                      </Link>
                    )}
                    <Link
                      to="/leaderboards/voting"
                      className="btn btn-sm btn-soft-secondary d-inline-flex align-items-center justify-content-between"
                    >
                      Past epochs
                      <FeatherIcon
                        icon="arrow-right"
                        size={14}
                        className="ms-2"
                      />
                    </Link>
                  </div>
                </div>
              </Col>
              <Col xs={12} md={6}>
                <LeaderboardCard
                  title="Block Income Leaderboard"
                  description="Validators ranked by median block income this epoch."
                  linkTo="/leaderboards/block-income"
                  icon="dollar-sign"
                />
              </Col>
            </>
          )}
        </Row>
      </div>
    </div>
  );
};

export default Home;
