import DelayedSpinner from 'components/common/DelayedSpinner';
import ConsensusHeader, {
  consensusBreadcrumbs
} from 'components/leaderboards/ConsensusHeader';
import {
  MIN_LEADER_SLOTS,
  byRank,
  productionRanks,
  formatShare,
  isLowStake,
  shareKey,
  consensusPath,
  producerSlots,
  productionInclusion
} from 'helpers/consensusBoards';
import PageBreadcrumb, { Crumb } from 'components/common/PageBreadcrumb';
import SearchBox from 'components/common/SearchBox';
import LowStakeToggle from 'components/leaderboards/LowStakeToggle';
import useHideLowStake from 'hooks/useHideLowStake';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import ProducerLeaderboardTable, {
  ProducerScore,
  createProducerLeaderboardColumns
} from 'components/tables/ProducerLeaderboardTable';
import { formatLamports } from 'helpers/utils';
import useAdvanceTable from 'hooks/useAdvanceTable';
import useConsensus from 'hooks/useConsensus';
import { useEpochLive } from 'hooks/useIngestion';
import EpochProgressStrip, {
  ingestedOfEpoch
} from 'components/leaderboards/EpochProgressStrip';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { ChangeEvent, useContext, useEffect, useMemo } from 'react';
import { Col, Form, Row } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router';

const breadcrumbItems: Crumb[] = consensusBreadcrumbs;

const SLOTS_PER_EPOCH = 432_000;

const pct = (v: number | null | undefined) =>
  v == null ? '—' : `${(v * 100).toFixed(2)}%`;

/**
 * Alpenglow block-producer leaderboard for one epoch
 * (/epochs/leaderboard/producers): how each leader's slots went (skip
 * rate), how much voting stake its blocks carried, its
 * producer bonus, and how its blocks finalized - with the cluster as a
 * pinned baseline. Alpenglow only; the epoch picker offers the epochs
 * with data.
 */
const ProducerLeaderboard = () => {
  const context = useContext(VortexDataContext);
  const navigate = useNavigate();
  const { epoch: epochParam } = useParams();
  const { alpenglowActive, phase, known, unavailable } = useConsensus();
  const currentEpoch = context?.currentEpochState.epoch ?? null;

  const parsed = epochParam ? Number.parseInt(epochParam) : NaN;
  const epoch = Number.isNaN(parsed) ? currentEpoch : parsed;

  const slice = context?.producerLeaderboardState;
  const fetchData = slice?.fetchData;
  const board = epoch != null ? slice?.data.get(epoch) : undefined;
  useEffect(() => {
    if (alpenglowActive && epoch != null) fetchData?.(epoch);
  }, [alpenglowActive, epoch, fetchData]);
  const viewingLive =
    epoch != null && currentEpoch != null && epoch >= currentEpoch;
  const refresh = () => {
    if (epoch != null) fetchData?.(epoch, { force: true });
  };
  // No board and an error: a Tower epoch (404) or the API predates it.
  const failed = !board && !slice?.isLoading && !!slice?.error;

  const records = useMemo(() => board?.records ?? [], [board]);
  const totalStake = useMemo(
    () => (records.length ? records.reduce((a, r) => a + r.stake, 0) : null),
    [records]
  );
  // The cluster's figures are in the cards above, not a table row. The
  // low-stake producers the switch hides: few enough leader slots that a
  // perfect score is luck (ranks are then among the ones shown).
  const [hideLow, setHideLow] = useHideLowStake();
  const lowStake = useMemo(
    () =>
      new Set(
        records
          .filter(r =>
            isLowStake(
              r.stake,
              totalStake,
              context?.currentEpochState.progress?.slotsInEpoch ?? undefined
            )
          )
          .map(r => r.nodeAddress)
      ),
    [records, totalStake, context?.currentEpochState.progress]
  );
  const data = useMemo(
    () =>
      hideLow ? records.filter(r => !lowStake.has(r.nodeAddress)) : records,
    [records, hideLow, lowStake]
  );
  // Fallback for APIs without the inclusion fields - effective inclusion: the producer bonus earned over the most its
  // leader slots could earn (every slot produced, carrying all voting
  // stake: budget / (2 x slots per epoch) each). Stake-normalized - leader
  // slots follow stake - with skipped slots counting as 0. The budget comes
  // from the epoch's participation leaderboard. The denominator never goes
  // below its slots plus the certificates counted (the bonus can include the window in
  // progress, the slot counts only finished windows: the extra
  // certificates are added as slots); vortex-data has been asked for an
  // exact field.
  const fetchBoard = context?.participationLeaderboardState.fetchData;
  useEffect(() => {
    if (alpenglowActive && epoch != null) fetchBoard?.(epoch);
  }, [alpenglowActive, epoch, fetchBoard]);
  const budget =
    epoch != null
      ? (context?.participationLeaderboardState.data.get(epoch)?.rewardTotals
          ?.budgetLamports ?? null)
      : null;
  const scoreOf = useMemo(() => {
    const maxPerSlot = budget ? budget / (2 * SLOTS_PER_EPOCH) : null;
    return (r: (typeof records)[number]) => {
      // The API's exact figure when it serves one (null stays null):
      // available inclusion, else effective.
      if (
        r.availableInclusion !== undefined ||
        r.effectiveInclusion !== undefined
      )
        return productionInclusion(r);
      if (maxPerSlot == null) return null;
      // Finished-window slots, plus any certificates beyond its finished
      // blocks (the window in progress), so skips still count.
      const slots =
        r.blocks + r.skippedSlots + Math.max(0, r.rewardCerts - r.blocks);
      return r.producerBonusLamports != null && slots > 0
        ? r.producerBonusLamports / (slots * maxPerSlot)
        : null;
    };
  }, [budget]);
  // A competition rank by score among the producers shown with
  // MIN_LEADER_SLOTS or more leader slots, tying on the shown value
  // (shareKey) - not the API's rank, which can't follow the low-stake
  // switch and splits scores that read the same.
  const scores = useMemo(() => {
    const { ranks } = productionRanks(data, scoreOf);
    const m = new Map<string, ProducerScore>();
    for (const r of data)
      m.set(r.nodeAddress, {
        score: scoreOf(r),
        rank: ranks.get(r.nodeAddress) ?? null
      });
    return m;
  }, [data, scoreOf]);
  // Shared ranks: every record after the first with the same rank.
  // In rank order (so any column's ties list by rank), and the tie
  // labels in that order: the first of a shared rank shows none.
  const ordered = useMemo(
    () =>
      byRank(
        data,
        r => scores.get(r.nodeAddress)?.rank,
        r => r.stake
      ),
    [data, scores]
  );
  const ties = useMemo(() => {
    const seen = new Set<number>();
    const out = new Set<string>();
    for (const r of ordered) {
      const rank = scores.get(r.nodeAddress)?.rank;
      if (rank == null) continue;
      if (seen.has(rank)) out.add(r.nodeAddress);
      else seen.add(rank);
    }
    return out;
  }, [ordered, scores]);
  const columns = useMemo(
    () =>
      createProducerLeaderboardColumns(
        board?.epoch ?? null,
        totalStake,
        ties,
        scores,
        MIN_LEADER_SLOTS
      ),
    [board?.epoch, totalStake, ties, scores]
  );
  const clusterScore = board?.cluster ? scoreOf(board.cluster) : null;
  const table = useAdvanceTable({
    data: ordered,
    columns,
    pageSize: 50,
    pagination: true,
    sortable: true,
    selection: false,
    getRowId: r => r.nodeAddress,
    resetPageKey: epoch ?? undefined,
    initialState: {
      sorting: [{ id: 'rank', desc: false }]
    }
  });

  // Epochs with data (ingestion.footerEpochs), plus the current one.
  const footerEpochs = useEpochLive().ingestion?.footerEpochs ?? null;
  const epochOptions = useMemo(() => {
    if (currentEpoch == null) return [];
    const past = (footerEpochs ?? []).filter(e => e < currentEpoch);
    const out = [
      { value: currentEpoch, label: `Epoch ${currentEpoch} (current)` },
      ...[...past]
        .sort((a, b) => b - a)
        .map(e => ({ value: e, label: `Epoch ${e}` }))
    ];
    if (epoch != null && !out.some(o => o.value === epoch))
      out.push({ value: epoch, label: `Epoch ${epoch}` });
    return out;
  }, [footerEpochs, currentEpoch, epoch]);
  const onEpoch = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = Number(e.target.value);
    navigate(consensusPath('production', v, currentEpoch));
  };

  const c = board?.cluster;
  const header = (
    <ConsensusHeader
      view="production"
      epoch={epoch}
      currentEpoch={currentEpoch}
    />
  );

  if (unavailable)
    return (
      <div>
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="mb-9">
          {header}
          <UntrackedState>The API is unavailable right now.</UntrackedState>
        </div>
      </div>
    );

  if (known && !alpenglowActive)
    return (
      <div>
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="mb-9">
          {header}
          <p className="text-body-tertiary">
            Alpenglow isn&apos;t active on this cluster yet
            {phase ? ` (${phase})` : ''}: block production is on the{' '}
            <Link to="/leaderboards/fees">fees leaderboard</Link>.
          </p>
        </div>
      </div>
    );

  return (
    <div>
      <PageBreadcrumb items={breadcrumbItems} />
      <div className="mb-9">
        {header}

        {c && (
          <Row className="g-3 mb-3">
            <Col xs={6} md>
              <StatCard
                label="Slot Skip Rate"
                value={pct(c.skipRate)}
                sublabel={`${c.skippedSlots.toLocaleString()} of ${(c.blocks + c.skippedSlots).toLocaleString()} slots`}
              />
            </Col>
            <Col xs={6} md>
              <StatCard
                label="Leader Slots"
                value={(c.blocks + c.skippedSlots).toLocaleString()}
                sublabel={`${c.blocks.toLocaleString()} blocks · ${c.skippedSlots.toLocaleString()} skipped`}
              />
            </Col>
            <Col xs={6} md>
              <StatCard
                label="Block Vote Inclusion"
                value={clusterScore != null ? formatShare(clusterScore) : '—'}
                sublabel={
                  <span title="The cluster's leader slots: the share of the online stake their blocks carried (voters in a 32+ slot offline run left out; skipped slots carry 0; a block carrying 99.9%+ counts as full), and the share of slots whose block was Perfect">
                    {c.perfectSlots != null && c.classifiedSlots
                      ? `Perfect ${formatShare(c.perfectSlots / c.classifiedSlots)} of slots`
                      : 'of online stake'}
                  </span>
                }
              />
            </Col>
          </Row>
        )}

        {viewingLive && board && (
          <EpochProgressStrip
            ingested={ingestedOfEpoch(
              board.lastIngestedSlot,
              context?.currentEpochState.progress
            )}
            total={context?.currentEpochState.progress?.slotsInEpoch ?? 432_000}
            loading={!!slice?.isLoading}
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
            <Form.Select
              size="sm"
              value={epoch ?? ''}
              onChange={onEpoch}
              aria-label="Epoch"
            >
              {epochOptions.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Form.Select>
          </Col>
        </Row>

        <div className="mx-n3 bg-body-emphasis border-top border-bottom border-translucent position-relative top-1">
          {failed ? (
            <p className="text-body-tertiary fs-9 text-center py-6 px-4 mb-0">
              No block-producer data for epoch {epoch} from this API.
            </p>
          ) : !board ? (
            <DelayedSpinner loading label="Loading producers…" />
          ) : records.length === 0 ? (
            <p className="text-body-tertiary fs-9 text-center py-6 px-4 mb-0">
              No producer records for epoch {board.epoch} yet.
            </p>
          ) : (
            <AdvanceTableProvider {...table}>
              <ProducerLeaderboardTable />
            </AdvanceTableProvider>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProducerLeaderboard;
