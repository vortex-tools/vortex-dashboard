import TowerHistoricalNote from 'components/common/TowerHistoricalNote';
import useConsensus from 'hooks/useConsensus';
import Button from 'components/base/Button';
import CompareValidatorsCta from 'components/common/CompareValidatorsCta';
import PageBreadcrumb, { Crumb } from 'components/common/PageBreadcrumb';
import { hasMissingBlockData } from 'helpers/utils';
import useRefreshOnce from 'hooks/useRefreshOnce';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Col, Row, Table } from 'react-bootstrap';
import { Link } from 'react-router';
import {
  EpochVotingLeaderboardRecord,
  IDEAL_RECORD_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';

const INITIAL_EPOCH_COUNT = 10;
const EPOCH_PAGE_SIZE = 5;

const truncateAddress = (addr: string) =>
  addr.length <= 20 ? addr : `${addr.slice(0, 8)}…${addr.slice(-8)}`;

const breadcrumbItems: Crumb[] = [
  { label: 'Home', url: '/' },
  { label: 'Voting', active: true }
];

const VotingLeaderboard = () => {
  const context = useContext(VortexDataContext);
  const { alpenglowActive, lastTowerEpoch } = useConsensus();
  // On an Alpenglow cluster Tower voting is historical: the newest Tower
  // epoch is the last one before the cutover, and none is "current".
  const currentEpoch = alpenglowActive
    ? lastTowerEpoch
    : (context?.currentEpochState.epoch ?? null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_EPOCH_COUNT);

  // The list now leads with the current epoch (in-progress) so users
  // don't need a separate "Current Leaderboard" CTA above the table.
  const recentEpochs = useMemo(() => {
    if (currentEpoch === null) return [];
    const min = Math.max(0, currentEpoch - (visibleCount - 1));
    const epochs: number[] = [];
    for (let i = currentEpoch; i >= min; i--) epochs.push(i);
    return epochs;
  }, [currentEpoch, visibleCount]);

  useEffect(() => {
    if (!context) return;
    recentEpochs.forEach(e => context.epochVoteLeaderboardState.fetchData(e));
  }, [context, recentEpochs]);

  // The current-epoch row is the only mutable entry in this table; the
  // others are immutable past epochs. Force-refresh once per page entry.
  useRefreshOnce(
    currentEpoch !== null ? String(currentEpoch) : undefined,
    () => {
      if (!context || currentEpoch === null) return;
      context.epochVoteLeaderboardState.fetchData(currentEpoch, {
        force: true
      });
    }
  );

  const canShowMore =
    currentEpoch !== null &&
    recentEpochs.length > 0 &&
    recentEpochs[recentEpochs.length - 1] > 0;

  return (
    <div>
      <PageBreadcrumb items={breadcrumbItems} />
      <div className="mb-9">
        <Row className="page-header align-items-start justify-content-between g-3">
          <Col xs="auto">
            <h1 className="h3">Voting Leaderboards</h1>
            <p className="text-body-tertiary lh-sm mb-0 mt-1">
              Per-epoch validator rankings by earned vote credits.
            </p>
          </Col>
        </Row>
        <TowerHistoricalNote />

        <div className="mb-4">
          <CompareValidatorsCta />
        </div>

        <div className="bg-body-emphasis rounded border border-translucent overflow-hidden mb-3 hover-underline-links">
          <Table responsive className="mb-0 fs-9" hover>
            <thead>
              <tr>
                <th className="ps-3">Epoch</th>
                <th>Rank 1</th>
                <th>Rank 2</th>
                <th>Rank 3</th>
                <th className="text-end">Top Perfect</th>
                <th className="text-end">Top Ok</th>
                <th className="text-end">Top Slow</th>
                <th className="text-end">Top Skipped</th>
                <th className="text-end pe-3">Validators</th>
              </tr>
            </thead>
            <tbody>
              {recentEpochs.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="text-center text-body-tertiary py-3"
                  >
                    —
                  </td>
                </tr>
              ) : (
                recentEpochs.map(e => {
                  const lb = context?.epochVoteLeaderboardState.data.get(e);
                  const realRecords = lb?.records.filter(
                    r => r.voteAddress !== IDEAL_RECORD_KEY
                  );
                  const hasData = !!realRecords && realRecords.length > 0;
                  const count = hasData ? realRecords.length : undefined;
                  const topThree = hasData
                    ? [...realRecords]
                        .sort((a, b) => b.earnedCredits - a.earnedCredits)
                        .slice(0, 3)
                    : [];
                  const renderValidator = (
                    v: EpochVotingLeaderboardRecord | undefined,
                    paddingClass = ''
                  ) => (
                    <td className={paddingClass}>
                      {v ? (
                        <Link
                          to={`/validator/${v.nodeAddress}`}
                          className="text-primary text-decoration-none text-truncate d-inline-block align-middle"
                          style={{ maxWidth: '12rem' }}
                          title={v.nodeName ?? v.nodeAddress}
                        >
                          {v.nodeName || truncateAddress(v.nodeAddress)}
                        </Link>
                      ) : (
                        <span className="text-body-tertiary">—</span>
                      )}
                    </td>
                  );
                  const isCurrent = !alpenglowActive && e === currentEpoch;
                  return (
                    <tr
                      key={e}
                      className={
                        isCurrent ? 'table-active fw-semibold' : undefined
                      }
                    >
                      <td className="ps-3">
                        <Link
                          to={`/leaderboards/voting/epoch/${e}`}
                          className="text-primary text-decoration-none fw-semibold"
                        >
                          Epoch {e}
                        </Link>
                        {isCurrent && (
                          <span className="badge bg-success-subtle text-success-emphasis ms-2 d-inline-flex align-items-center gap-1 fw-semibold">
                            <span
                              className="bg-success rounded-circle d-inline-block"
                              style={{ width: 6, height: 6 }}
                            />
                            In progress
                          </span>
                        )}
                        {hasMissingBlockData(e) && (
                          <span
                            className="text-body ms-2"
                            title="Missing block data"
                          >
                            (not filled)
                          </span>
                        )}
                      </td>
                      {renderValidator(topThree[0])}
                      {renderValidator(topThree[1])}
                      {renderValidator(topThree[2])}
                      {/* Top performer's slot-status breakdown — quick
                          read on whether the leader was actually clean.
                          Color fires only on non-zero values so a clean
                          "0" doesn't look like a warning. */}
                      {(() => {
                        const top = topThree[0];
                        if (!top) return null;
                        const total =
                          top.perfectSlots +
                          top.okSlots +
                          top.slowSlots +
                          top.skippedSlots;
                        const pct =
                          total === 0
                            ? undefined
                            : (top.perfectSlots / total) * 100;
                        return (
                          <td
                            className={`text-end font-monospace${
                              pct !== undefined && top.perfectSlots > 0
                                ? ' text-success'
                                : ''
                            }`}
                          >
                            {pct !== undefined ? `${pct.toFixed(2)}%` : '—'}
                          </td>
                        );
                      })()}
                      {!topThree[0] && (
                        <td className="text-end font-monospace">—</td>
                      )}
                      <td
                        className={`text-end font-monospace${
                          topThree[0] && topThree[0].okSlots > 0
                            ? ' text-primary-emphasis'
                            : ''
                        }`}
                      >
                        {topThree[0]
                          ? topThree[0].okSlots.toLocaleString()
                          : '—'}
                      </td>
                      <td
                        className={`text-end font-monospace${
                          topThree[0] && topThree[0].slowSlots > 0
                            ? ' text-warning'
                            : ''
                        }`}
                      >
                        {topThree[0]
                          ? topThree[0].slowSlots.toLocaleString()
                          : '—'}
                      </td>
                      <td
                        className={`text-end font-monospace${
                          topThree[0] && topThree[0].skippedSlots > 0
                            ? ' text-danger'
                            : ''
                        }`}
                      >
                        {topThree[0]
                          ? topThree[0].skippedSlots.toLocaleString()
                          : '—'}
                      </td>
                      <td className="text-end font-monospace pe-3">
                        {count !== undefined ? (
                          <Link
                            to={`/leaderboards/voting/epoch/${e}`}
                            className="text-primary text-decoration-none"
                          >
                            {count.toLocaleString()}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </div>

        {canShowMore && (
          <div className="d-flex justify-content-center">
            <Button
              variant="link"
              className="text-primary"
              onClick={() => setVisibleCount(c => c + EPOCH_PAGE_SIZE)}
            >
              Show {EPOCH_PAGE_SIZE} more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VotingLeaderboard;
