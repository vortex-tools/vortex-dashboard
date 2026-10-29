import ValidatorPageHeader, {
  validatorTabPath
} from 'components/validator/ValidatorPageHeader';
import useCluster from 'hooks/useCluster';
import AddressLine from 'components/common/AddressLine';
import {
  RecentVoteAccountChanges,
  ValidatorKeyLines
} from 'components/validator/ValidatorKeys';
import DelayedSpinner from 'components/common/DelayedSpinner';
import PageBreadcrumb, { Crumb } from 'components/common/PageBreadcrumb';
import SectionCard from 'components/common/SectionCard';
import HostChangesCard from 'components/validator/HostChangesCard';
import GovernanceCard from 'components/validator/GovernanceCard';
import StatCard from 'components/common/StatCard';
import ValidatorProduction from 'components/validator/ValidatorProduction';
import ValidatorConsensus, {
  ParticipationTile
} from 'components/validator/ValidatorConsensus';
import useConsensus from 'hooks/useConsensus';
import ValidatorStatus, {
  ValidatorNotices,
  useValidatorNotices,
  ValidatorSfdpBox,
  FACT_TILES,
  ValidatorFacts,
  ValidatorWithdrawer,
  ValidatorAge,
  ValidatorWebsite
} from 'components/validator/ValidatorStatus';
import FeatherIcon from 'feather-icons-react';
import { formatLamports, hasMissingBlockData } from 'helpers/utils';
import { isSfdpState } from 'helpers/sfdp';
import useLiveRefresh from 'hooks/useLiveRefresh';
import useRefreshOnce from 'hooks/useRefreshOnce';
import useValidatorIdentity from 'hooks/useValidatorIdentity';
import { useContext, useEffect, useMemo } from 'react';
import { Col, Row, Spinner, Table } from 'react-bootstrap';
import { Link, useParams } from 'react-router';
import {
  IDEAL_RECORD_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';

const RECENT_EPOCH_COUNT = 10;
// Inlined at build time. The operational-status section is staging-only for
// now; making it live in production is flipping this gate.
// The ideal vote-stats series carries `lastUploadedBucket` per epoch (0..431);
// below 431 means the epoch is still uploading, i.e. its counters are a moving
// target. Matches the gate in ClusterVoteStats.
const LAST_EPOCH_BUCKET = 431;
const LIVE_REFRESH_MS = 30_000;

const validatorBreadcrumbPlaceholder: Crumb[] = [{ label: 'Home', url: '/' }];

const EpochLabel = ({ epoch }: { epoch: number }) => (
  <>
    {epoch}
    {hasMissingBlockData(epoch) && (
      <span className="text-body-tertiary fs-10 ms-1">(missing)</span>
    )}
  </>
);

const ValidatorOverview = () => {
  const { alpenglowActive, known: consensusKnown } = useConsensus();
  // Tower vote data is only fetched while Tower is the current consensus:
  // on an Alpenglow cluster the page shows the Consensus card instead, and
  // identity resolves through the validator directory.
  const towerCurrent = consensusKnown && !alpenglowActive;
  const { blockIncomeTracked, isTestnet } = useCluster();
  const { address } = useParams();
  const context = useContext(VortexDataContext);

  // Trigger leaderboard fetches (cheap — server-cached) so we can resolve
  // the validator's identity and compute current-epoch ranks.
  useEffect(() => {
    if (!context) return;
    if (towerCurrent) context.epochVoteLeaderboardState.fetchData();
    context.epochIncomeLeaderboardState.fetchData();
  }, [context, towerCurrent]);

  const currentEpoch = context?.currentEpochState.epoch ?? null;

  const identity = useValidatorIdentity(address);
  // Everything needing attention; decides the layout below.
  const notices = useValidatorNotices(
    identity?.nodeAddress ?? '',
    identity?.voteAddress ?? ''
  );

  // Once we know the validator's canonical addresses, kick off the Tower
  // "Recent Voting" history (IDEAL: the baseline for Missed Credits).
  useEffect(() => {
    if (!context || !identity) return;
    const vs = context.epochVoteStatsState;
    if (towerCurrent) {
      vs.fetchData(identity.voteAddress);
      vs.fetchData(IDEAL_RECORD_KEY);
    }
  }, [context, identity, towerCurrent]);

  // Current-epoch KPIs (leaderboards) + "Recent" sections (per-validator
  // series) all mutate server-side mid-epoch. Force-refresh once per
  // (validator, epoch) page entry so we don't render against partial
  // snapshots left over from earlier in the session.
  const refreshCurrentEpoch = () => {
    if (!context || !identity) return;
    if (towerCurrent) {
      context.epochVoteLeaderboardState.fetchData(undefined, { force: true });
      context.epochVoteStatsState.fetchData(IDEAL_RECORD_KEY, { force: true });
      context.epochVoteStatsState.fetchData(identity.voteAddress, {
        force: true
      });
    }
    context.epochIncomeLeaderboardState.fetchData(undefined, { force: true });
  };

  useRefreshOnce(
    identity && currentEpoch !== null
      ? `${identity.nodeAddress}:${currentEpoch}`
      : undefined,
    refreshCurrentEpoch
  );

  // ...and keep refreshing while the epoch is still being uploaded. Without
  // this the page renders whatever snapshot it happened to fetch on entry for
  // the rest of the session, so a row that was only transiently wrong — a
  // validator's record trailing the cluster's by one 1000-slot bucket shows up
  // as exactly 1000 skipped slots — never corrects itself on screen.
  const idealVoteStats =
    context?.epochVoteStatsState.data.get(IDEAL_RECORD_KEY);
  const currentEpochInProgress =
    currentEpoch !== null &&
    (idealVoteStats?.find(entry => entry.epoch === currentEpoch)
      ?.lastUploadedBucket ?? 0) < LAST_EPOCH_BUCKET;
  useLiveRefresh(
    // A 'fallback' identity is just the URL string echoed back, so its
    // voteAddress isn't a real key — don't poll on it.
    identity !== undefined &&
      identity.source !== 'fallback' &&
      currentEpochInProgress,
    LIVE_REFRESH_MS,
    refreshCurrentEpoch
  );

  const { votingRank, incomeRecord, incomeRank } = useMemo(() => {
    if (!context || currentEpoch === null || !identity)
      return {
        votingRank: undefined,
        incomeRecord: undefined,
        incomeRank: undefined
      };

    const votingLb = context.epochVoteLeaderboardState.data.get(currentEpoch);
    const incomeLb = context.epochIncomeLeaderboardState.data.get(currentEpoch);

    let vRank: number | undefined;
    if (votingLb) {
      const record = votingLb.records.find(
        r => r.voteAddress === identity.voteAddress
      );
      vRank = record?.rank;
    }

    let iRec;
    let iRank: number | undefined;
    if (incomeLb) {
      const ranked = incomeLb.records.filter(
        r => r.nodeAddress !== IDEAL_RECORD_KEY
      );
      const idx = ranked.findIndex(r => r.nodeAddress === identity.nodeAddress);
      const rec = idx >= 0 ? ranked[idx] : undefined;
      // Suppress rank when the validator produced no blocks yet this epoch —
      // a "rank" over zero income is meaningless.
      const hasIncome = rec !== undefined && rec.confirmedSlots > 0;
      iRank = hasIncome ? idx + 1 : undefined;
      iRec = hasIncome ? rec : undefined;
    }

    return { votingRank: vRank, incomeRecord: iRec, incomeRank: iRank };
  }, [context, currentEpoch, identity]);

  const recentVoting = useMemo(() => {
    if (!context || !identity) return undefined;
    const series = context.epochVoteStatsState.data.get(identity.voteAddress);
    if (!series) return undefined;
    const sorted = [...series].sort((a, b) => b.epoch - a.epoch);
    // If the validator has no vote-stats row for the current epoch yet,
    // prepend a placeholder so the card shows the epoch as pending rather
    // than skipping it.
    const curr = context.currentEpochState.epoch;
    const rows: Array<{
      epoch: number;
      ranking: number;
      earnedCredits: number;
      votedSlots: number;
      totalLatency: number;
      totalExcessLatency: number;
      perfectSlots: number;
      okSlots: number;
      slowSlots: number;
      skippedSlots: number;
      isPlaceholder?: boolean;
    }> = [];
    if (curr !== null && !sorted.some(r => r.epoch === curr)) {
      rows.push({
        epoch: curr,
        ranking: 0,
        earnedCredits: 0,
        votedSlots: 0,
        totalLatency: 0,
        totalExcessLatency: 0,
        perfectSlots: 0,
        okSlots: 0,
        slowSlots: 0,
        skippedSlots: 0,
        isPlaceholder: true
      });
    }
    rows.push(...sorted);
    return rows.slice(0, RECENT_EPOCH_COUNT);
  }, [context, identity]);

  const idealVotingByEpoch = useMemo(() => {
    const map = new Map<
      number,
      { earnedCredits: number; votedSlots: number }
    >();
    const series = context?.epochVoteStatsState.data.get(IDEAL_RECORD_KEY);
    series?.forEach(entry =>
      map.set(entry.epoch, {
        earnedCredits: entry.earnedCredits,
        votedSlots: entry.votedSlots
      })
    );
    return map;
  }, [context]);

  if (!context) return <div>Loading...</div>;

  // A failed read of the current epoch or the voting leaderboard (they
  // retry, and the API banner says when it's down) doesn't take the page
  // over: it renders with what it has, missing figures as "—".

  // We're still loading if we don't yet have *any* identity source — neither
  // the current-epoch leaderboard nor the directory has resolved yet. Once
  // either is loaded (even if empty), we render the page; missing stats show
  // as "—" rather than forcing a "not found" dead-end.
  const votingLeaderboardLoaded =
    currentEpoch !== null &&
    context.epochVoteLeaderboardState.data.has(currentEpoch);
  const directoryLoaded =
    context.validatorDirectoryState.validators !== null ||
    context.validatorDirectoryState.error !== null;
  const isLoadingRaw = !votingLeaderboardLoaded && !directoryLoaded;

  if (isLoadingRaw) {
    return (
      <div>
        <PageBreadcrumb items={validatorBreadcrumbPlaceholder} />
        <div className="mb-9">
          <DelayedSpinner loading={isLoadingRaw} label="Loading validator…" />
        </div>
      </div>
    );
  }

  // Not found: neither the leaderboard nor the (loaded) validator
  // directory knows the address - e.g. a testnet validator opened against
  // the mainnet API. ('fallback' = the URL echoed back, not a validator.)
  const directoryReady = context.validatorDirectoryState.validators !== null;
  if (!identity || (identity.source === 'fallback' && directoryReady)) {
    const cluster = context.currentEpochState.cluster;
    return (
      <div>
        <PageBreadcrumb items={validatorBreadcrumbPlaceholder} />
        <div className="mb-9 text-center py-6">
          <FeatherIcon
            icon="user-x"
            size={32}
            className="text-body-tertiary mb-3"
          />
          <h3 className="mb-2">Validator not found</h3>
          <p className="text-body-tertiary mb-1">
            No validator with the address{' '}
            <span className="font-monospace text-break">{address}</span>
            {cluster ? ` on ${cluster}` : ''}.
          </p>
          <p className="text-body-tertiary fs-9 mb-4">
            It may be on another cluster, or not staked right now.
          </p>
          <Link to="/validators" className="btn btn-primary">
            Browse validators
          </Link>
        </div>
      </div>
    );
  }

  const { nodeAddress, voteAddress, displayName } = identity;
  // The row under Details: SFDP on testnet (participants only) and Notices (only
  // with something to say, or no status to say it from); nothing when
  // neither has anything.
  const statusSlice = context.validatorStatusState;
  const status = statusSlice.data.get(nodeAddress);
  const belowDetails =
    (isTestnet && !!status && isSfdpState(status.sfdp.participant?.state)) ||
    notices.length > 0 ||
    (!status && !statusSlice.isLoading && !!statusSlice.error);
  // A label column per card, so its values align ("Inflation collector",
  // "Vote balance" the longest).
  const keyLabelWidth = '8.5rem';
  const factLabelWidth = '6.5rem';
  const blocksProduced = incomeRecord?.confirmedSlots;
  const totalSlots = incomeRecord?.totalSlots;
  const skippedSlots = incomeRecord?.skippedSlots;
  // Leader slots still ahead this epoch: scheduled, neither produced nor
  // skipped yet.
  const slotsToCome =
    totalSlots != null && blocksProduced != null && skippedSlots != null
      ? Math.max(0, totalSlots - blocksProduced - skippedSlots)
      : null;
  const medianBlockIncome = incomeRecord
    ? incomeRecord.medianIncome.baseFees +
      incomeRecord.medianIncome.priorityFees +
      incomeRecord.medianIncome.mevTips
    : undefined;

  // Current-epoch rank / block KPIs, as tiles.
  const kpiTiles = [
    <StatCard
      key="voting-rank"
      label="Voting Rank"
      value={votingRank ? `#${votingRank.toLocaleString()}` : '—'}
      sublabel="Current epoch"
      linkTo={
        currentEpoch !== null
          ? `/leaderboards/voting/epoch/${currentEpoch}`
          : '/leaderboards/voting'
      }
    />,
    <StatCard
      key="income-rank"
      label="Income Rank"
      value={
        blockIncomeTracked && incomeRank
          ? `#${incomeRank.toLocaleString()}`
          : '—'
      }
      sublabel={blockIncomeTracked ? 'Current epoch' : 'Not tracked on testnet'}
      linkTo={blockIncomeTracked ? '/leaderboards/block-income' : undefined}
    />,
    <StatCard
      key="blocks"
      label="Blocks Produced"
      // Produced / leader slots, and under it how many are still to come
      // (and any skipped, in red) - so the gap isn't read as skips.
      value={
        blocksProduced !== undefined
          ? `${blocksProduced.toLocaleString()}${
              totalSlots ? ` / ${totalSlots.toLocaleString()}` : ''
            }`
          : '—'
      }
      sublabel={
        !blockIncomeTracked ? (
          'Not tracked on testnet'
        ) : slotsToCome != null ? (
          <>
            {slotsToCome
              ? `${slotsToCome.toLocaleString()} to come`
              : 'none to come'}
            {!!skippedSlots && (
              <span className="text-danger">
                {' · '}
                {skippedSlots.toLocaleString()} skipped
              </span>
            )}
          </>
        ) : (
          'Current epoch'
        )
      }
      linkTo={validatorTabPath(nodeAddress, 'production')}
    />,
    <StatCard
      key="median-income"
      label="Median Block Income"
      value={
        medianBlockIncome !== undefined
          ? formatLamports(medianBlockIncome, 4)
          : '—'
      }
      sublabel="Current epoch"
    />
  ];

  const recentVotingCard = (
    <SectionCard
      title="Recent Voting"
      icon="bar-chart-2"
      linkTo={`/validator/${voteAddress}/votes`}
      linkLabel="Full history"
    >
      {recentVoting === undefined ? (
        <div
          className="d-flex justify-content-center py-4"
          role="status"
          aria-live="polite"
        >
          <Spinner animation="border" variant="primary" size="sm" />
        </div>
      ) : recentVoting.length === 0 ? (
        <p className="text-body-tertiary fs-9 mb-0">No voting data.</p>
      ) : (
        <Table responsive size="sm" className="data-table fs-9 mb-0">
          <thead className="text-nowrap">
            <tr>
              <th>Epoch</th>
              <th className="text-end">Rank</th>
              <th className="text-end">Perfect</th>
              <th className="text-end">Ok</th>
              <th className="text-end">Slow</th>
              <th className="text-end">Skipped</th>
              <th className="text-end">Deductions</th>
              <th className="text-end">Lag</th>
            </tr>
          </thead>
          <tbody>
            {recentVoting.map(row => {
              if (row.isPlaceholder) {
                return (
                  <tr key={row.epoch}>
                    <td>
                      <Link
                        to={`/validator/${voteAddress}/votes/epoch/${row.epoch}`}
                      >
                        <EpochLabel epoch={row.epoch} />
                      </Link>
                    </td>
                    <td className="text-end text-body-tertiary">—</td>
                    <td className="text-end text-body-tertiary">—</td>
                    <td className="text-end text-body-tertiary">—</td>
                    <td className="text-end text-body-tertiary">—</td>
                    <td className="text-end text-body-tertiary">—</td>
                    <td className="text-end text-body-tertiary">—</td>
                    <td className="text-end text-body-tertiary">—</td>
                  </tr>
                );
              }
              const ideal = idealVotingByEpoch.get(row.epoch);
              const deductions =
                ideal !== undefined
                  ? Math.max(0, ideal.earnedCredits - row.earnedCredits)
                  : undefined;
              const totalVotable =
                row.perfectSlots +
                row.okSlots +
                row.slowSlots +
                row.skippedSlots;
              const perfectPct =
                totalVotable === 0
                  ? undefined
                  : (row.perfectSlots / totalVotable) * 100;
              return (
                <tr key={row.epoch}>
                  <td>
                    <Link
                      to={`/validator/${voteAddress}/votes/epoch/${row.epoch}`}
                    >
                      <EpochLabel epoch={row.epoch} />
                    </Link>
                  </td>
                  <td className="text-end font-monospace">
                    <Link
                      to={`/leaderboards/voting/epoch/${row.epoch}`}
                      className="text-primary"
                    >
                      #{row.ranking.toLocaleString()}
                    </Link>
                  </td>
                  <td className="text-end font-monospace text-success fw-semibold">
                    {perfectPct === undefined ? (
                      <span className="opacity-50">—</span>
                    ) : row.perfectSlots === 0 ? (
                      <span className="opacity-50">{`${perfectPct.toFixed(2)}%`}</span>
                    ) : (
                      `${perfectPct.toFixed(2)}%`
                    )}
                  </td>
                  <td className="text-end font-monospace text-primary-emphasis fw-semibold">
                    {row.okSlots === 0 ? (
                      <span className="opacity-50">0</span>
                    ) : (
                      row.okSlots.toLocaleString()
                    )}
                  </td>
                  <td className="text-end font-monospace text-warning fw-semibold">
                    {row.slowSlots === 0 ? (
                      <span className="opacity-50">0</span>
                    ) : (
                      row.slowSlots.toLocaleString()
                    )}
                  </td>
                  <td className="text-end font-monospace text-danger fw-semibold">
                    {row.skippedSlots === 0 ? (
                      <span className="opacity-50">0</span>
                    ) : (
                      row.skippedSlots.toLocaleString()
                    )}
                  </td>
                  <td className="text-end font-monospace">
                    {deductions === undefined ? (
                      '—'
                    ) : deductions === 0 ? (
                      <span className="opacity-50">0</span>
                    ) : (
                      deductions.toLocaleString()
                    )}
                  </td>
                  <td className="text-end font-monospace">
                    {row.totalExcessLatency === 0 ? (
                      <span className="opacity-50">0</span>
                    ) : (
                      row.totalExcessLatency.toLocaleString()
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </SectionCard>
  );
  // Alpenglow clusters: consensus participation replaces the (historical)
  // Tower Recent Voting card.
  const voteCard = alpenglowActive ? (
    <ValidatorConsensus voteAddress={voteAddress} linkAddress={nodeAddress} />
  ) : (
    recentVotingCard
  );
  // 6 node tiles + 3 KPIs. Median Block Income is left out here: Recent
  // Income shows it per epoch.
  // Alpenglow: the tiles get the row to themselves (testnet: one row of
  // six; mainnet: two rows of four), Voting | Production below. Earnings,
  // block income and stake are the Income tab.
  const tilesWide = alpenglowActive;
  const tilesGrid = (
    <ValidatorStatus
      nodeAddress={nodeAddress}
      wide={tilesWide}
      // Client, location, commission and vote balance are in the keys box.
      exclude={FACT_TILES}
      extraTiles={kpiTiles
        // Testnet tracks no block income: its tiles would only say so.
        .filter(
          t =>
            t.key !== 'median-income' &&
            (blockIncomeTracked ||
              (t.key !== 'income-rank' && t.key !== 'blocks'))
        )
        .map(t =>
          alpenglowActive && t.key === 'voting-rank' ? (
            <ParticipationTile
              key="participation"
              voteAddress={voteAddress}
              linkAddress={nodeAddress}
            />
          ) : (
            t
          )
        )}
    />
  );

  return (
    <div>
      <ValidatorPageHeader
        address={address ?? nodeAddress}
        name={displayName}
        nodeAddress={nodeAddress}
        tab="overview"
      />
      <div className="mb-9">
        <Row className="align-items-start justify-content-between mb-3 g-3">
          <Col xs={12}>
            {/* Details (keys and node facts), then Notices below it. */}
            <Row className="g-3 align-items-stretch">
              {/* Addresses (its keys, and their recent changes) | Details
                  (everything else about it); stacked on phones. */}
              <Col xs={12} lg={6}>
                <SectionCard title="Addresses" icon="key">
                  <div className="detail-lines min-w-0">
                    <AddressLine
                      label="Identity"
                      value={nodeAddress}
                      labelWidth={keyLabelWidth}
                    />
                    <AddressLine
                      label="Vote Account"
                      value={voteAddress}
                      labelWidth={keyLabelWidth}
                    />
                    <ValidatorWithdrawer
                      nodeAddress={nodeAddress}
                      labelWidth={keyLabelWidth}
                    />
                    {/* The voter, collectors and a missing BLS key. */}
                    <ValidatorKeyLines
                      nodeAddress={nodeAddress}
                      voteAddress={voteAddress}
                      labelWidth={keyLabelWidth}
                    />
                  </div>
                  <RecentVoteAccountChanges
                    nodeAddress={nodeAddress}
                    voteAddress={voteAddress}
                  />
                </SectionCard>
              </Col>
              <Col xs={12} lg={6}>
                <SectionCard title="Details" icon="file-text">
                  {/* Name, Site, Version, Client, Location, Commission,
                      Vote balance, Running. */}
                  <div className="detail-lines min-w-0">
                    <div className="d-flex align-items-baseline gap-2 min-w-0">
                      <span
                        className="text-body-tertiary fs-9 flex-shrink-0"
                        style={{ minWidth: factLabelWidth }}
                      >
                        Name
                      </span>
                      <span className="fs-9 fw-semibold text-truncate">
                        {displayName}
                      </span>
                    </div>
                    <ValidatorWebsite
                      nodeAddress={nodeAddress}
                      labelWidth={factLabelWidth}
                    />
                    <ValidatorFacts
                      nodeAddress={nodeAddress}
                      labelWidth={factLabelWidth}
                    />
                    <ValidatorAge
                      nodeAddress={nodeAddress}
                      labelWidth={factLabelWidth}
                    />
                  </div>
                </SectionCard>
              </Col>
              {/* Under them, full width: what needs attention (when
                  anything does), and SFDP on testnet (mainnet: Staking
                  tab). */}
              {belowDetails && (
                <Col xs={12} className="d-flex flex-column gap-3">
                  {isTestnet && <ValidatorSfdpBox nodeAddress={nodeAddress} />}
                  <ValidatorNotices
                    notices={notices}
                    nodeAddress={nodeAddress}
                  />
                </Col>
              )}
            </Row>
          </Col>
        </Row>

        {/* Tower: 2 x 2 from lg up - tiles | Recent Voting (as tall as the
            tiles, its table scrolling), then Earnings | Recent Income. On
            phones the tiles come first. */}
        {alpenglowActive ? (
          // Alpenglow: the tiles across the top; then Voting | Production
          // (the two halves of consensus); then Earnings | Recent Income
          // (mainnet - testnet has neither real rewards nor block income).
          <Row className="g-3 mb-3">
            <Col xs={12}>{tilesGrid}</Col>
            <Col xs={12} lg={6}>
              {voteCard}
            </Col>
            <Col xs={12} lg={6}>
              <ValidatorProduction
                voteAddress={voteAddress}
                nodeAddress={nodeAddress}
              />
            </Col>
            {nodeAddress && (
              <Col xs={12} lg={6}>
                <HostChangesCard
                  identity={nodeAddress}
                  currentEpoch={currentEpoch}
                />
              </Col>
            )}
            {nodeAddress && <GovernanceCard identity={nodeAddress} />}
          </Row>
        ) : (
          <Row className="g-3 mb-3">
            <Col xs={12} lg={6} className="order-2">
              <div className="fit-row-height-lg">{voteCard}</div>
            </Col>
            <Col xs={12} lg={6} className="order-1">
              {tilesGrid}
            </Col>
          </Row>
        )}
      </div>
    </div>
  );
};

export default ValidatorOverview;
