import { DataFreshnessSublabel } from 'components/common/DataFreshness';
import UntrackedState from 'components/common/UntrackedState';
import DelayedSpinner from 'components/common/DelayedSpinner';
import ConsensusHeader, {
  consensusBreadcrumbs
} from 'components/leaderboards/ConsensusHeader';
import { byRank, consensusPath, formatShare } from 'helpers/consensusBoards';
import EpochProgressStrip, {
  ingestedOfEpoch
} from 'components/leaderboards/EpochProgressStrip';
import PageBreadcrumb, { Crumb } from 'components/common/PageBreadcrumb';
import SearchBox from 'components/common/SearchBox';
import StatCard from 'components/common/StatCard';
import WarningBanner from 'components/common/WarningBanner';
import ParticipationLeaderboardTable, {
  createParticipationLeaderboardColumns,
  participationRate,
  participationTies
} from 'components/tables/ParticipationLeaderboardTable';
import useAdvanceTable from 'hooks/useAdvanceTable';
import useConsensus from 'hooks/useConsensus';
import { useEpochLive } from 'hooks/useIngestion';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { ChangeEvent, useContext, useEffect, useMemo, useState } from 'react';
import { Col, Form, Row } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router';

const breadcrumbItems: Crumb[] = consensusBreadcrumbs;

// The epoch in progress gains a bucket roughly every few minutes.

/**
 * Alpenglow participation leaderboard for one epoch, from
 * /epochs/leaderboard/participation: who voted (notarize or skip) on how
 * much of the epoch, skipped blocks, misses and finalization. The current
 * product once Alpenglow is active on the cluster (see useConsensus); on
 * a Tower cluster it just says so.
 */
const ParticipationLeaderboard = () => {
  const context = useContext(VortexDataContext);
  const navigate = useNavigate();
  const { epoch: epochParam } = useParams();
  const { alpenglowActive, cutoverEpoch, phase, known, unavailable } =
    useConsensus();
  const currentEpoch = context?.currentEpochState.epoch ?? null;

  const parsed = epochParam ? Number.parseInt(epochParam) : NaN;
  const epoch = Number.isNaN(parsed) ? currentEpoch : parsed;

  const slice = context?.participationLeaderboardState;
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

  const records = useMemo(() => board?.records ?? [], [board]);
  // Tie labels in the table's (rank) order: the first of a shared rank
  // shows none.
  const ties = useMemo(
    () =>
      participationTies(
        byRank(
          records,
          r => r.rank,
          r => r.stake
        )
      ),
    [records]
  );
  // Ranks, ties and totals stay over every record; the toggle only
  // narrows the rows shown.
  const [notAdmittedOnly, setNotAdmittedOnly] = useState(false);
  const notAdmittedCount = useMemo(
    () => records.filter(r => !r.admitted).length,
    [records]
  );
  // In rank order, so any column's ties list by rank.
  const shown = useMemo(
    () =>
      byRank(
        notAdmittedOnly ? records.filter(r => !r.admitted) : records,
        r => r.rank,
        r => r.stake
      ),
    [records, notAdmittedOnly]
  );
  const totalStake = useMemo(
    () => (records.length ? records.reduce((a, r) => a + r.stake, 0) : null),
    [records]
  );
  const columns = useMemo(
    () =>
      createParticipationLeaderboardColumns(
        ties,
        board?.epoch ?? null,
        totalStake
      ),
    [ties, board?.epoch, totalStake]
  );
  const table = useAdvanceTable({
    data: shown,
    columns,
    pageSize: 50,
    pagination: true,
    sortable: true,
    selection: false,
    getRowId: r => r.voteAddress,
    resetPageKey: `${epoch ?? ''}${notAdmittedOnly ? 'n' : ''}`
  });

  const kpis = useMemo(() => {
    if (!board) return null;
    const admitted = records.filter(r => r.admitted);
    let stake = 0;
    let weighted = 0;
    for (const r of admitted) {
      const p = participationRate(r);
      if (p == null) continue;
      stake += r.stake;
      weighted += r.stake * p;
    }
    // The middle admitted validator's votes landed: a yardstick for a row.
    const rates = admitted
      .map(r => participationRate(r))
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    const m = Math.floor(rates.length / 2);
    // And its share of finalization certificates.
    const fin = admitted
      .filter(r => r.finalizedCerts > 0)
      .map(r => r.finalizedSlots / r.finalizedCerts)
      .sort((a, b) => a - b);
    const fm = Math.floor(fin.length / 2);
    return {
      admitted: admitted.length,
      total: records.length,
      participation: stake > 0 ? weighted / stake : null,
      finalizedMedian: fin.length
        ? fin.length % 2
          ? fin[fm]
          : (fin[fm - 1] + fin[fm]) / 2
        : null,
      median: rates.length
        ? rates.length % 2
          ? rates[m]
          : (rates[m - 1] + rates[m]) / 2
        : null,
      lateSkips: admitted.reduce((a, r) => a + r.skippedNotarizedSlots, 0),
      // Skip votes on notarized blocks / votes on notarized blocks.
      lateSkipRate: (() => {
        const blocks = admitted.reduce(
          (a, r) => a + r.notarizedSlots + r.skippedNotarizedSlots,
          0
        );
        return blocks > 0
          ? admitted.reduce((a, r) => a + r.skippedNotarizedSlots, 0) / blocks
          : null;
      })(),
      lateSkippers: admitted.filter(r => r.skippedNotarizedSlots > 0).length,
      missed: admitted.reduce((a, r) => a + r.missedSlots, 0),
      missers: admitted.filter(r => r.missedSlots > 0).length,
      // Misses in offline runs (validators not voting) - most of the total
      // when a few admitted validators are down; null until classified.
      offline: admitted.every(r => r.missCauses)
        ? admitted.reduce((a, r) => a + (r.missCauses?.offlineSlots ?? 0), 0)
        : null
    };
  }, [board, records]);

  // A past epoch we have no consensus data for: nothing to rank.
  const noData = (b: typeof board) =>
    !!b && !b.complete && b.lastIngestedSlot == null && b.eligibleSlots === 0;
  const notIngested =
    noData(board) &&
    epoch != null &&
    currentEpoch != null &&
    epoch < currentEpoch;

  // Epochs with data: the API's list (ingestion.footerEpochs) when it
  // reports one; else, assuming ingestion is contiguous up to now, the
  // epochs after the newest past epoch seen with no data.
  const footerEpochs = useEpochLive().ingestion?.footerEpochs ?? null;
  const boards = context?.participationLeaderboardState.data;
  const fallbackFloor = useMemo(() => {
    let floor = cutoverEpoch;
    if (floor == null || currentEpoch == null) return floor;
    for (const [e, b] of boards ?? [])
      if (e < currentEpoch && noData(b)) floor = Math.max(floor, e + 1);
    return floor;
  }, [cutoverEpoch, currentEpoch, boards]);
  const firstOffered = footerEpochs?.length
    ? Math.min(...footerEpochs)
    : fallbackFloor;

  // Newest first: next epoch (admission only), the current one, then the
  // past epochs with data. An epoch without data shows only while it's
  // the one being viewed (its URL was opened directly).
  const epochOptions = useMemo(() => {
    if (currentEpoch == null) return [];
    const past = footerEpochs
      ? [...footerEpochs].filter(e => e < currentEpoch)
      : fallbackFloor != null
        ? Array.from(
            { length: Math.max(0, currentEpoch - fallbackFloor) },
            (_, i) => fallbackFloor + i
          )
        : [];
    const out: Array<{ value: number; label: string }> = [
      {
        value: currentEpoch + 1,
        label: `Epoch ${currentEpoch + 1} (next: admission only)`
      },
      { value: currentEpoch, label: `Epoch ${currentEpoch} (current)` },
      ...past
        .sort((x, y) => y - x)
        .map(e => ({ value: e, label: `Epoch ${e}` }))
    ];
    if (epoch != null && !out.some(o => o.value === epoch))
      out.push({ value: epoch, label: `Epoch ${epoch} (no data)` });
    return out;
  }, [footerEpochs, fallbackFloor, currentEpoch, epoch]);

  const onEpoch = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = Number(e.target.value);
    navigate(consensusPath('voting', v, currentEpoch));
  };

  const header = (
    <ConsensusHeader view="voting" epoch={epoch} currentEpoch={currentEpoch} />
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

  if (known && !alpenglowActive) {
    return (
      <div>
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="mb-9">
          {header}
          <p className="text-body-tertiary">
            Alpenglow isn't active on this cluster yet
            {phase ? ` (${phase})` : ''}. Voting is still TowerBFT: see the{' '}
            <Link to="/leaderboards/voting">voting leaderboard</Link>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageBreadcrumb items={breadcrumbItems} />
      <div className="mb-9">
        {header}

        {notIngested ? (
          <>
            <Row className="justify-content-end mb-4 g-3">
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
            <div className="text-center py-6 px-4">
              <p className="text-body-tertiary mb-3">
                We don&apos;t have consensus data for epoch {epoch}
                {firstOffered != null && firstOffered > (epoch ?? 0)
                  ? `: our records start at epoch ${firstOffered}.`
                  : '.'}
              </p>
              <Link
                to={consensusPath('voting', null, currentEpoch)}
                className="btn btn-soft-primary btn-sm"
              >
                Go to the current epoch
                {currentEpoch != null ? ` (${currentEpoch})` : ''}
              </Link>
            </div>
          </>
        ) : (
          <>
            {kpis && (
              <Row className="g-3 mb-3">
                <Col xs={6} md>
                  <StatCard
                    label="Votes Landed"
                    value={
                      kpis.participation == null
                        ? '—'
                        : formatShare(kpis.participation)
                    }
                    sublabel={
                      <span title="Admitted validators' votes in the slots' reward certificates / the slots they could vote on, weighted by stake; and the middle admitted validator's">
                        of admitted stake&apos;s votes
                        {kpis.median != null &&
                          ` · median ${formatShare(kpis.median)}`}
                      </span>
                    }
                  />
                </Col>
                <Col xs={6} md>
                  <StatCard
                    label="Missed Votes"
                    value={kpis.missed.toLocaleString()}
                    sublabel={
                      <span title="Admitted validators' votes in neither reward certificate of their slot (unpaid). Offline: in a run of 32+ consecutive misses - the validator wasn't voting.">
                        {kpis.offline != null
                          ? `offline ${kpis.offline.toLocaleString()} · other ${(kpis.missed - kpis.offline).toLocaleString()}`
                          : `${kpis.missers.toLocaleString()} validators`}
                      </span>
                    }
                  />
                </Col>
                <Col xs={6} md>
                  <StatCard
                    label="Fast Votes"
                    value={
                      kpis.finalizedMedian != null
                        ? `${(kpis.finalizedMedian * 100).toFixed(1)}%`
                        : '—'
                    }
                    sublabel={
                      <span title="The middle admitted validator's share of finalization certificates its vote is in: nearly all are fast certificates - the first 80% of stake whose notarize votes reached the next leader in time. How early votes arrive, as the next leaders see it; not rewarded.">
                        median admitted validator
                      </span>
                    }
                  />
                </Col>
                <Col xs={6} md>
                  <StatCard
                    label="Skipped Blocks"
                    value={kpis.lateSkips.toLocaleString()}
                    sublabel={
                      <span title="Admitted validators' skip votes on blocks the cluster notarized: the block reached them late, or they were slow. Still paid.">
                        {kpis.lateSkippers.toLocaleString()} validators
                        {kpis.lateSkipRate != null &&
                          ` · ${(kpis.lateSkipRate * 100).toFixed(3)}% of votes on blocks`}
                      </span>
                    }
                  />
                </Col>
                <Col xs={12} md>
                  <StatCard
                    label="Admitted Validators"
                    value={`${kpis.admitted.toLocaleString()} / ${kpis.total.toLocaleString()}`}
                    sublabel="able to vote this epoch"
                  />
                </Col>
              </Row>
            )}

            {board && board.missingFooters > 0 && (
              <WarningBanner>
                Our footer archive is missing{' '}
                {board.missingFooters.toLocaleString()} slots this epoch; rates
                count only the slots we have.
              </WarningBanner>
            )}

            {viewingLive && board && !board.complete && (
              <EpochProgressStrip
                ingested={ingestedOfEpoch(
                  board.lastIngestedSlot,
                  context?.currentEpochState.progress
                )}
                total={
                  context?.currentEpochState.progress?.slotsInEpoch ?? 432_000
                }
                loading={!!slice?.isLoading}
                onRefresh={refresh}
                freshness={<DataFreshnessSublabel sources={['footers']} />}
              />
            )}

            <Row className="align-items-center justify-content-between mb-3 g-3">
              <SearchBox
                placeholder="Search"
                onChange={e =>
                  table.setGlobalFilter(e.target.value || undefined)
                }
              />
              <Col xs="auto" className="ms-sm-auto">
                <Form.Check
                  type="switch"
                  id="consensus-not-admitted-only"
                  label={`Not admitted only (${notAdmittedCount.toLocaleString()})`}
                  checked={notAdmittedOnly}
                  onChange={e => setNotAdmittedOnly(e.target.checked)}
                  className="mb-0"
                  disabled={notAdmittedCount === 0 && !notAdmittedOnly}
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
              {!board ? (
                <DelayedSpinner loading label="Loading participation…" />
              ) : records.length === 0 ? (
                <p className="text-body-tertiary fs-9 text-center py-6 px-4 mb-0">
                  No participation records for epoch {board.epoch}.
                </p>
              ) : (
                <AdvanceTableProvider {...table}>
                  <ParticipationLeaderboardTable />
                </AdvanceTableProvider>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ParticipationLeaderboard;
