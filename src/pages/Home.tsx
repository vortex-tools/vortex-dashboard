import EpochProgressSublabel from 'components/common/EpochProgressSublabel';
import useCluster from 'hooks/useCluster';
import useConsensus from 'hooks/useConsensus';
import FeatherIcon from 'feather-icons-react';
import StatCard from 'components/common/StatCard';
import SlotStrip from 'components/home/SlotStrip';
import ThroughputCard from 'components/home/ThroughputCard';
import HomeAnnouncements from 'components/home/HomeAnnouncements';
import ValidatorSearch from 'components/common/ValidatorSearch';
import { formatDuration } from 'helpers/utils';
import { useEpochLive, useClusterHalt } from 'hooks/useIngestion';
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

/** "84%", or "<1%" / ">99%" at the ends. */
const pctShare = (x: number) => {
  const p = x * 100;
  return p > 0 && p < 1
    ? '<1%'
    : p > 99 && p < 100
      ? '>99%'
      : `${Math.round(p)}%`;
};

/** Activated stake by client: Agave from the left, Firedancer from the
 *  right, anything else between. */
const ClientSplitBar = ({
  agave,
  firedancer,
  other
}: {
  agave: number;
  firedancer: number;
  other: number;
}) => (
  <span
    className="d-block"
    title={`Agave ${pctShare(agave)} · Firedancer ${pctShare(firedancer)}${other >= 0.005 ? ` · other / unknown ${pctShare(other)}` : ''} of activated stake`}
  >
    <span
      className="d-flex rounded-1 overflow-hidden bg-body-highlight"
      style={{ height: 6 }}
    >
      <span className="bg-primary" style={{ width: `${agave * 100}%` }} />
      <span style={{ width: `${other * 100}%` }} />
      <span
        className="bg-client-firedancer"
        style={{ width: `${firedancer * 100}%` }}
      />
    </span>
    <span className="d-flex justify-content-between gap-2 mt-1">
      <span>Agave</span>
      <span>Firedancer</span>
    </span>
  </span>
);

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

// /epochs/current is tiny: poll it every 2 s.
const LIVE_POLL_MS = 2_000;
const Home = () => {
  const context = useContext(VortexDataContext);

  const currentEpoch = context?.currentEpochState.epoch ?? null;
  const live = useEpochLive(true, LIVE_POLL_MS);
  const { blockIncomeTracked, isTestnet } = useCluster();
  const totals =
    live.totals && live.totals.epoch === currentEpoch ? live.totals : null;
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
    const byFamily = new Map<string, number>();
    for (const v of vs) {
      const f = v.software?.family ?? 'unknown';
      byFamily.set(f, (byFamily.get(f) ?? 0) + v.activatedStake);
    }
    // The client split: Agave (Jito included) vs Firedancer, of all
    // activated stake; the rest (other clients, unknown) is "other".
    const agave = (byFamily.get('agave') ?? 0) / total;
    const firedancer = (byFamily.get('firedancer') ?? 0) / total;
    return {
      total,
      delinquentShare: delinquent / total,
      clients: { agave, firedancer, other: Math.max(0, 1 - agave - firedancer) }
    };
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

  const slotSeconds = live.progress?.slotSeconds;
  const skipRate =
    totals?.processedSlots && totals.skippedSlots != null
      ? totals.skippedSlots / totals.processedSlots
      : null;
  // Rows of three; testnet's first row has a fourth (participation).
  const cardCol = blockIncomeTracked ? { xs: 6, md: 4 } : { xs: 6, md: 3 };
  const rowTwoCol = { xs: 6, md: 4 };
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
          <Col {...cardCol}>
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
          <Col {...cardCol}>
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
          <Col {...cardCol}>
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
          {!blockIncomeTracked && (
            <Col {...cardCol}>
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
            </Col>
          )}
          <Col {...rowTwoCol}>
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
          <Col {...rowTwoCol}>
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
          <Col {...rowTwoCol}>
            <StatCard
              label="Clients"
              mono={false}
              value={
                snapshot ? (
                  <span className="d-flex justify-content-between gap-2">
                    <span className="text-primary">
                      {pctShare(snapshot.clients.agave)}
                    </span>
                    <span className="text-client-firedancer">
                      {pctShare(snapshot.clients.firedancer)}
                    </span>
                  </span>
                ) : (
                  '—'
                )
              }
              sublabel={
                snapshot ? <ClientSplitBar {...snapshot.clients} /> : 'of stake'
              }
              linkTo={isTestnet ? '/decentralization' : '/client-versions'}
            />
          </Col>
        </Row>

        <HomeAnnouncements />
        <Row className="g-3 mb-3">
          <Col xs={12} lg={6}>
            <SlotStrip />
          </Col>
          <Col xs={12} lg={6}>
            <ThroughputCard metrics={['tps', 'cu']} compact />
          </Col>
        </Row>

        {blockIncomeTracked && (
          <div className="mb-3">
            <ThroughputCard metrics={['income']} />
          </div>
        )}

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
