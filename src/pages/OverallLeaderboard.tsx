import DelayedSpinner from 'components/common/DelayedSpinner';
import PageBreadcrumb from 'components/common/PageBreadcrumb';
import SearchBox from 'components/common/SearchBox';
import LowStakeToggle from 'components/leaderboards/LowStakeToggle';
import useHideLowStake from 'hooks/useHideLowStake';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import ConsensusHeader, {
  consensusBreadcrumbs
} from 'components/leaderboards/ConsensusHeader';
import OverallLeaderboardTable, {
  OverallRow,
  createOverallLeaderboardColumns
} from 'components/tables/OverallLeaderboardTable';
import {
  consensusPath,
  byRank,
  formatShare,
  isLowStake,
  rankOverall
} from 'helpers/consensusBoards';
import EpochProgressStrip, {
  ingestedOfEpoch
} from 'components/leaderboards/EpochProgressStrip';
import { formatLamports } from 'helpers/utils';
import useAdvanceTable from 'hooks/useAdvanceTable';
import useConsensus from 'hooks/useConsensus';
import useConsensusEpochOptions, {
  consensusNoData
} from 'hooks/useConsensusEpochOptions';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import {
  ParticipationLeaderboardRecord,
  VortexDataContext
} from 'providers/VortexDataProvider';
import { ReactElement, useContext, useEffect, useMemo } from 'react';
import { Col, Form, Row } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router';

const pct = (v: number | null) =>
  v == null ? '—' : `${(v * 100).toFixed(2)}%`;

/**
 * The consensus leaderboard's default view: each validator's Alpenglow
 * rewards from voting and block production together, as a share of what
 * its stake and leader slots could have earned (helpers/consensusBoards),
 * from the epoch's participation and producer leaderboards.
 */
const OverallLeaderboard = ({ epoch }: { epoch: number | null }) => {
  const context = useContext(VortexDataContext);
  const navigate = useNavigate();
  const { alpenglowActive, phase, known, unavailable } = useConsensus();
  const currentEpoch = context?.currentEpochState.epoch ?? null;

  const fetchVoting = context?.participationLeaderboardState.fetchData;
  const fetchProducing = context?.producerLeaderboardState.fetchData;
  useEffect(() => {
    if (!alpenglowActive || epoch == null) return;
    fetchVoting?.(epoch);
    fetchProducing?.(epoch);
  }, [alpenglowActive, epoch, fetchVoting, fetchProducing]);
  const viewingLive =
    epoch != null && currentEpoch != null && epoch >= currentEpoch;
  const refresh = () => {
    if (epoch == null) return;
    fetchVoting?.(epoch, { force: true });
    fetchProducing?.(epoch, { force: true });
  };
  const voting =
    epoch != null
      ? context?.participationLeaderboardState.data.get(epoch)
      : undefined;
  const producing =
    epoch != null
      ? context?.producerLeaderboardState.data.get(epoch)
      : undefined;
  const budget = voting?.rewardTotals?.budgetLamports ?? null;
  const slotsPerEpoch =
    context?.currentEpochState.progress?.slotsInEpoch ?? undefined;

  // Total stake, and the low-stake validators the switch hides (ranks are
  // then among the ones shown; the cards count everyone).
  const [hideLow, setHideLow] = useHideLowStake();
  const allStake = useMemo(
    () => (voting ? voting.records.reduce((a, r) => a + r.stake, 0) : null),
    [voting]
  );
  const lowStake = useMemo(
    () =>
      new Set(
        (voting?.records ?? [])
          .filter(r => isLowStake(r.stake, allStake, slotsPerEpoch))
          .map(r => r.voteAddress)
      ),
    [voting, allStake, slotsPerEpoch]
  );
  const buildRows = (records: ParticipationLeaderboardRecord[]) => {
    const ranked = rankOverall(
      records,
      producing?.records ?? [],
      budget,
      slotsPerEpoch
    );
    // In rank order (so any column's ties list by rank); ties: every
    // record after the first at a shared rank.
    const seen = new Set<number>();
    const ordered = byRank(
      records,
      r => ranked.get(r.voteAddress)?.rank,
      r => r.stake
    );
    const real = ordered.map(r => {
      const x = ranked.get(r.voteAddress)!;
      const tie = x.rank != null && seen.has(x.rank);
      if (x.rank != null) seen.add(x.rank);
      return {
        r,
        ...x,
        tie
      };
    });
    return real;
  };
  const allRows = useMemo<OverallRow[]>(
    () => (voting ? buildRows(voting.records) : []),
    [voting, producing, budget, slotsPerEpoch]
  );
  const rows = useMemo<OverallRow[]>(
    () =>
      voting && hideLow
        ? buildRows(voting.records.filter(r => !lowStake.has(r.voteAddress)))
        : allRows,
    [allRows, hideLow, lowStake]
  );
  const totalStake = allStake;
  const columns = useMemo(
    () => createOverallLeaderboardColumns(voting?.epoch ?? null, totalStake),
    [voting?.epoch, totalStake]
  );
  const table = useAdvanceTable({
    data: rows,
    columns,
    pageSize: 50,
    pagination: true,
    sortable: true,
    selection: false,
    getRowId: x => x.r.voteAddress,
    resetPageKey: epoch ?? undefined,
    initialState: { sorting: [{ id: 'rank', desc: false }] }
  });

  // Cluster totals over admitted validators.
  const kpis = useMemo(() => {
    const admitted = allRows.filter(x => x.r.admitted && x.score);
    if (!admitted.length) return null;
    const sum = (f: (x: OverallRow) => number) =>
      admitted.reduce((a, x) => a + f(x), 0);
    const earned = sum(x => x.score!.earned);
    const bonus = sum(x => x.score!.bonus);
    const votePossible = sum(x => x.score!.votePossible);
    const producePossible = sum(x => x.score!.producePossible);
    return {
      admitted: admitted.length,
      total: allRows.length,
      earned,
      share:
        votePossible + producePossible > 0
          ? earned / (votePossible + producePossible)
          : null,
      bonus
    };
  }, [allRows]);

  const { options: epochOptions, firstOffered } =
    useConsensusEpochOptions(epoch);
  const notIngested =
    consensusNoData(voting) &&
    epoch != null &&
    currentEpoch != null &&
    epoch < currentEpoch;

  const header = (
    <ConsensusHeader view="overall" epoch={epoch} currentEpoch={currentEpoch} />
  );
  const picker = (
    <Form.Select
      size="sm"
      value={epoch ?? ''}
      onChange={e =>
        navigate(consensusPath('overall', Number(e.target.value), currentEpoch))
      }
      aria-label="Epoch"
    >
      {epochOptions.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Form.Select>
  );

  const shell = (body: ReactElement) => (
    <div>
      <PageBreadcrumb items={consensusBreadcrumbs} />
      <div className="mb-9">
        {header}
        {body}
      </div>
    </div>
  );

  if (unavailable)
    return shell(
      <UntrackedState>The API is unavailable right now.</UntrackedState>
    );
  if (known && !alpenglowActive)
    return shell(
      <>
        <p className="text-body-tertiary">
          Alpenglow isn&apos;t active on this cluster yet
          {phase ? ` (${phase})` : ''}. Voting is still TowerBFT: see the{' '}
          <Link to="/leaderboards/voting">voting leaderboard</Link>.
        </p>
      </>
    );
  if (notIngested)
    return shell(
      <>
        <Row className="justify-content-end mb-4 g-3">
          <Col xs={12} sm={4}>
            {picker}
          </Col>
        </Row>
        <div className="text-center py-6 px-4">
          <p className="text-body-tertiary mb-3">
            We don&apos;t have consensus data for epoch {epoch}
            {firstOffered != null && firstOffered > (epoch ?? 0)
              ? `: our records start at epoch ${firstOffered}.`
              : '.'}
          </p>
          <Link
            to="/leaderboards/consensus"
            className="btn btn-soft-primary btn-sm"
          >
            Go to the current epoch
            {currentEpoch != null ? ` (${currentEpoch})` : ''}
          </Link>
        </div>
      </>
    );

  return shell(
    <>
      {kpis && (
        <Row className="g-3 mb-3">
          <Col xs={6} md>
            <StatCard
              label="Inflation Rewards Earned"
              value={formatLamports(kpis.earned, 0)}
              sublabel={
                <span title="Vote rewards plus producer bonus (cluster-wide the two are equal: every paid vote pays its voter and its producer the same) over what admitted validators could earn: every vote in each slot with a reward certificate, and every leader slot carrying all online voters">
                  {kpis.share != null
                    ? `${formatShare(kpis.share)} reward efficiency`
                    : undefined}
                </span>
              }
            />
          </Col>
          <Col xs={6} md>
            {/* One figure for both sides: each block carries the votes
                that land (the voter's 'votes landed' and the producer's
                inclusion are the same votes). Average over blocks; the API
                has no per-block median yet. */}
            <StatCard
              label="Stake Voting per Block"
              value={(() => {
                const v = producing?.cluster?.meanIncludedStakePpb;
                return v != null ? formatShare(v / 1e9) : '—';
              })()}
              sublabel={
                <span title="The share of all stake whose votes each block's reward certificates carried, averaged over the epoch's blocks (skipped slots aren't blocks). The same votes as Votes Landed, counted per block. Offline validators count as not voting.">
                  average per block
                  {producing?.cluster?.perfectSlots != null &&
                  producing.cluster.classifiedSlots
                    ? ` · ${formatShare(producing.cluster.perfectSlots / producing.cluster.classifiedSlots)} of slots Perfect`
                    : ''}
                </span>
              }
            />
          </Col>
          <Col xs={6} md>
            <StatCard
              label="Slot Skip Rate"
              value={pct(producing?.cluster?.skipRate ?? null)}
              sublabel={
                producing?.cluster
                  ? `${producing.cluster.skippedSlots.toLocaleString()} leader slots skipped`
                  : undefined
              }
            />
          </Col>
          <Col xs={6} md>
            <StatCard
              label="Admitted Validators"
              value={`${kpis.admitted.toLocaleString()} / ${kpis.total.toLocaleString()}`}
              sublabel="able to vote this epoch"
            />
          </Col>
        </Row>
      )}

      {viewingLive && voting && !voting.complete && (
        <EpochProgressStrip
          ingested={ingestedOfEpoch(
            voting.lastIngestedSlot,
            context?.currentEpochState.progress
          )}
          total={slotsPerEpoch ?? 432_000}
          loading={!!context?.participationLeaderboardState.isLoading}
          onRefresh={refresh}
        />
      )}

      <Row className="align-items-center justify-content-between mb-3 g-3">
        <SearchBox
          placeholder="Search"
          onChange={e => table.setGlobalFilter(e.target.value || undefined)}
        />
        <Col xs="auto" className="ms-sm-auto">
          <LowStakeToggle
            hide={hideLow}
            onChange={setHideLow}
            count={lowStake.size}
          />
        </Col>
        <Col xs={12} sm={4}>
          {picker}
        </Col>
      </Row>

      <div className="mx-n3 bg-body-emphasis border-top border-bottom border-translucent position-relative top-1">
        {!voting ? (
          <DelayedSpinner loading label="Loading leaderboard…" />
        ) : rows.length === 0 ? (
          <p className="text-body-tertiary fs-9 text-center py-6 px-4 mb-0">
            No records for epoch {voting.epoch}.
          </p>
        ) : (
          <AdvanceTableProvider {...table}>
            <OverallLeaderboardTable />
          </AdvanceTableProvider>
        )}
      </div>
    </>
  );
};

export default OverallLeaderboard;
