import EpochProgressSublabel from 'components/common/EpochProgressSublabel';
import useCluster from 'hooks/useCluster';
import useConsensus from 'hooks/useConsensus';
import FeatherIcon from 'feather-icons-react';
import StatCard from 'components/common/StatCard';
import SlotStrip from 'components/home/SlotStrip';
import ClientDiversityCard from 'components/home/ClientDiversityCard';
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
  FEATURES_KEY,
  GOVERNANCE_KEY,
  IDEAL_RECORD_KEY,
  VALIDATOR_STATUS_SUMMARY_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';
import ChartSkeleton from 'components/common/ChartSkeleton';
import { ALL_ANNOUNCEMENTS } from 'hooks/useAnnouncements';

/** Longest the live cards wait for the reads that decide the layout. */
const SETTLE_MAX_MS = 3_000;

/** The live cards' stand-in while the layout is decided: a card's
 *  outline, a title bar and a chart skeleton, at about its height. */
const PlaceholderCard = () => (
  <div className="bg-body-emphasis rounded border border-translucent p-3 h-100">
    <div className="placeholder-glow mb-3">
      <span className="placeholder col-4 rounded bg-body-secondary" />
    </div>
    <ChartSkeleton height={150} />
  </div>
);

/**
 * Whether the reads that decide which live cards show, and where, are in:
 * the cluster (testnet has no versions or fees), its client versions, and
 * what the Announcements card would list (posts, feature gates,
 * governance). Started here so they run together from the first render;
 * true after SETTLE_MAX_MS whatever is still out, or once an answer is an
 * error.
 */
const useHomeLayoutSettled = () => {
  const context = useContext(VortexDataContext);
  const versions = context?.clusterVersionsState;
  const features = context?.featuresState;
  const governance = context?.governanceProposalsState;
  const announcements = context?.announcementsState;
  const fetchVersions = versions?.fetchData;
  const fetchFeatures = features?.fetchData;
  const fetchGovernance = governance?.fetchData;
  const fetchAnnouncements = announcements?.fetchData;
  useEffect(() => {
    fetchVersions?.(10);
    fetchFeatures?.(FEATURES_KEY);
    fetchGovernance?.(GOVERNANCE_KEY);
    fetchAnnouncements?.(ALL_ANNOUNCEMENTS);
  }, [fetchVersions, fetchFeatures, fetchGovernance, fetchAnnouncements]);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), SETTLE_MAX_MS);
    return () => clearTimeout(t);
  }, []);
  const epoch = context?.currentEpochState;
  const testnet = epoch?.cluster === 'testnet';
  const done = <K, T>(
    x: { data: Map<K, T>; error: string | null } | undefined,
    key: K
  ) => !!x && (x.data.has(key) || !!x.error);
  return (
    timedOut ||
    (!!epoch &&
      (epoch.epoch != null || !!epoch.error) &&
      (testnet || done(versions, 10)) &&
      done(features, FEATURES_KEY) &&
      (testnet || done(governance, GOVERNANCE_KEY)) &&
      done(announcements, ALL_ANNOUNCEMENTS))
  );
};

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

  // Stake and its delinquent share, from the status summary.
  const snapshot = useMemo(() => {
    if (!summary?.validators.length) return null;
    const vs = summary.validators;
    const total = vs.reduce((a, v) => a + v.activatedStake, 0);
    if (!total) return null;
    const delinquent = vs
      .filter(v => v.delinquent)
      .reduce((a, v) => a + v.activatedStake, 0);
    return { total, delinquentShare: delinquent / total };
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
  // One row from md up (four cards; five on testnet, with Consensus
  // Participation), two across on phones.
  const cardCol = { xs: 6, md: true };
  const halt = useClusterHalt();
  // The Client Diversity chart, once there are epochs of versions.
  const hasDiversity =
    (context?.clusterVersionsState.data.get(10)?.epochs.filter(e => e.stake)
      .length ?? 0) >= 2;
  // Halted: the halted chain's last slot (the epoch reading can show the
  // restart snapshot's slot once our node has restarted onto it).
  const tickingSlot = useTickingSlot(live.progress, !!halt);
  // The live cards wait for the reads that place them, then come in
  // together (stand-ins until then), rather than one by one.
  const settled = useHomeLayoutSettled();
  const currentSlot = halt ? halt.slot : tickingSlot;

  return (
    <div>
      <div className="mb-9">
        {/* Search, then the cluster at a glance. */}
        <div className="text-center pt-5 mt-3 mb-4">
          <h2 className="mb-1">Vortex</h2>
          {/* Padded and balanced, so a phone splits it into two even lines
              rather than leaving "income." alone. */}
          <p
            className="text-body-tertiary mb-3 px-2"
            style={{ textWrap: 'balance' }}
          >
            Solana validator performance, vote quality, and fees.
          </p>
          <div className="mx-auto" style={{ maxWidth: '40rem' }}>
            <ValidatorSearch />
          </div>
        </div>

        {/* Phones: Epoch and Slot lead (two across), the rest after. */}
        <Row className="g-3 mb-3">
          <Col {...cardCol}>
            <StatCard
              label="Status"
              mono={false}
              value={live.loaded ? (halt ? 'Halted' : 'Healthy') : '—'}
              check={live.loaded && !halt ? true : null}
              plainCheck
              alert={!!halt}
              // Halted: since when. Else the stake whose validators
              // aren't voting (amber past 5%).
              sublabel={
                halt ? (
                  `since ${formatDuration(Date.now() / 1000 - halt.since)} ago`
                ) : snapshot ? (
                  <span
                    className={
                      snapshot.delinquentShare > 0.05
                        ? 'text-warning-emphasis'
                        : undefined
                    }
                    title={`${compactSol(snapshot.delinquentShare * snapshot.total)} of ${compactSol(snapshot.total)} active stake${skipRate != null ? ` · skip rate ${(skipRate * 100).toFixed(1)}% this epoch` : ''}`}
                  >
                    {(snapshot.delinquentShare * 100).toFixed(2)}% stake
                    delinquent
                  </span>
                ) : undefined
              }
              linkTo="/status"
            />
          </Col>
          <Col {...cardCol} className="order-first order-md-0">
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
          <Col {...cardCol} className="order-first order-md-0">
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
          <Col {...cardCol}>
            <StatCard
              label="Validators"
              value={active ? active.active.toLocaleString() : '—'}
              sublabel={
                active
                  ? `active of ${active.staked.toLocaleString()} staked${consensusKpis ? ` · ${consensusKpis.admitted.toLocaleString()} in consensus` : ''}`
                  : 'active'
              }
              linkTo="/validators"
            />
          </Col>
        </Row>

        {settled && <HomeAnnouncements />}
        {/* Until settled the live cards load unseen, at full width (so
            their charts size right), under stand-ins of the same grid. */}
        <div className="position-relative">
          {!settled && (
            <Row className="g-3 mb-3">
              {[0, 1, 2, 3].map(i => (
                <Col key={i} xs={12} lg={6}>
                  <PlaceholderCard />
                </Col>
              ))}
            </Row>
          )}
          {/* Live Slots | Client Diversity, then Live TPS | Fees per Minute;
            either takes the row when its partner has nothing to show
            (testnet: no versions yet, no block income). */}
          <Row
            className="g-3 mb-3"
            style={
              settled
                ? undefined
                : {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    visibility: 'hidden'
                  }
            }
            aria-hidden={!settled || undefined}
          >
            <Col xs={12} lg={hasDiversity ? 6 : 12}>
              <SlotStrip />
            </Col>
            <Col xs={12} lg={6} className={hasDiversity ? undefined : 'd-none'}>
              <ClientDiversityCard compact />
            </Col>
            <Col xs={12} lg={blockIncomeTracked ? 6 : 12}>
              <ThroughputCard metrics={['tps', 'cu']} compact />
            </Col>
            {blockIncomeTracked && (
              <Col xs={12} lg={6}>
                <ThroughputCard metrics={['income']} compact />
              </Col>
            )}
          </Row>
        </div>

        {/* Leaderboard quick-launch. On Alpenglow clusters the consensus
            leaderboard leads (Tower voting is historical); without block
            data the income board gives way to the validators list. */}
        <Row className="g-3">
          {alpenglowActive ? (
            <>
              <Col xs={12} md={6}>
                <LeaderboardCard
                  title="Consensus Leaderboard"
                  description="Validators ranked by vote participation this epoch."
                  linkTo="/leaderboards/consensus"
                  icon="activity"
                />
              </Col>
              <Col xs={12} md={6}>
                {blockIncomeTracked ? (
                  <LeaderboardCard
                    title="Fees Leaderboard"
                    description="Validators ranked by their median block’s fees this epoch."
                    linkTo="/leaderboards/fees"
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
                  title="Fees Leaderboard"
                  description="Validators ranked by their median block’s fees this epoch."
                  linkTo="/leaderboards/fees"
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
