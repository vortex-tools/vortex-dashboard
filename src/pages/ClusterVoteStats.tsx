import useConsensus from 'hooks/useConsensus';
import { faPause, faPlay } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import FeatherIcon from 'feather-icons-react';
import Button from 'components/base/Button';
import DelayedSpinner from 'components/common/DelayedSpinner';
import EmptyEpochState from 'components/common/EmptyEpochState';
import PageBreadcrumb, { Crumb } from 'components/common/PageBreadcrumb';
import SearchBox from 'components/common/SearchBox';
import WarningBanner from 'components/common/WarningBanner';
import { hasMissingBlockData } from 'helpers/utils';
import useAdvanceTable from 'hooks/useAdvanceTable';
import useEpochSelectOptions from 'hooks/useEpochSelectOptions';
import useRefreshOnce from 'hooks/useRefreshOnce';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import {
  ChangeEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Col, Form, ProgressBar, Row, Spinner } from 'react-bootstrap';
import {
  EpochVotingLeaderboard,
  IDEAL_RECORD_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';
import EpochVotingLeaderboardTable, {
  computeSubsequentTies,
  createEpochVotingLeaderboardTableColumns
} from 'components/tables/EpochVotingLeaderboardTable';
import { useNavigate, useParams } from 'react-router';

interface SelectedEpoch {
  current: boolean;
  epoch?: number;
}

const ClusterVoteStats = () => {
  const context = useContext(VortexDataContext);
  const navigate = useNavigate();
  const { epoch } = useParams();
  const parsedEpoch = epoch ? Number.parseInt(epoch) : undefined;
  const epochParamIsValid =
    parsedEpoch !== undefined && !Number.isNaN(parsedEpoch);
  const [selectedEpoch, setSelectedEpoch] = useState<SelectedEpoch>({
    current: epoch === undefined,
    epoch: epochParamIsValid ? parsedEpoch : undefined
  });

  useEffect(() => {
    if (!context) return;
    if (selectedEpoch.current) {
      context.epochVoteLeaderboardState.fetchData();
    } else if (selectedEpoch.epoch !== undefined) {
      context.epochVoteLeaderboardState.fetchData(selectedEpoch.epoch);
    }
  }, [context, selectedEpoch]);

  // Fetch the ideal vote-stats series so we can read `lastUploadedBucket` to
  // detect whether the viewed epoch is still in progress or backfilling.
  useEffect(() => {
    if (!context) return;
    context.epochVoteStatsState.fetchData(IDEAL_RECORD_KEY);
  }, [context]);

  // Force-refresh once per page entry while viewing the current epoch — the
  // leaderboard mutates server-side and any cached snapshot is partial.
  // (The auto-refresh below picks up further updates while the page stays
  // open; this fires only on entry.)
  const currentEpochForRefresh = context?.currentEpochState.epoch ?? null;
  const viewingCurrent =
    currentEpochForRefresh !== null &&
    (selectedEpoch.current || selectedEpoch.epoch === currentEpochForRefresh);
  useRefreshOnce(
    viewingCurrent ? String(currentEpochForRefresh) : undefined,
    () => {
      if (!context) return;
      context.epochVoteLeaderboardState.fetchData(undefined, { force: true });
      context.epochVoteStatsState.fetchData(IDEAL_RECORD_KEY, { force: true });
    }
  );

  const REFRESH_INTERVAL_S = 30;
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [secondsUntilRefresh, setSecondsUntilRefresh] =
    useState(REFRESH_INTERVAL_S);

  const refresh = useCallback(() => {
    if (!context) return;
    if (selectedEpoch.current) {
      context.epochVoteLeaderboardState.fetchData(undefined, { force: true });
    } else if (selectedEpoch.epoch !== undefined) {
      context.epochVoteLeaderboardState.fetchData(selectedEpoch.epoch, {
        force: true
      });
    }
    context.epochVoteStatsState.fetchData(IDEAL_RECORD_KEY, { force: true });
  }, [context, selectedEpoch]);

  // Refresh callback may change identity often; ref keeps the timer effect
  // from re-arming on every render.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Auto-refresh timer. Only runs while auto-refresh is on AND the viewed
  // epoch is the current in-progress one. Effect cleans up when any of
  // those conditions changes.
  useEffect(() => {
    if (!autoRefresh || !context) return;
    const currentEpoch = context.currentEpochState.epoch;
    const target = selectedEpoch.epoch ?? currentEpoch ?? undefined;
    if (target === undefined || target === null) return;
    if (target !== currentEpoch) return;
    const idealStats = context.epochVoteStatsState.data
      .get(IDEAL_RECORD_KEY)
      ?.find(entry => entry.epoch === target);
    if (!idealStats || idealStats.lastUploadedBucket >= 431) return;

    setSecondsUntilRefresh(REFRESH_INTERVAL_S);
    const id = setInterval(() => {
      setSecondsUntilRefresh(s => {
        if (s <= 1) {
          refreshRef.current();
          return REFRESH_INTERVAL_S;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [autoRefresh, context, selectedEpoch]);

  const { resolvedEpoch, leaderboardData } = useMemo(() => {
    if (selectedEpoch.epoch !== undefined) {
      return {
        resolvedEpoch: selectedEpoch.epoch,
        leaderboardData: context?.epochVoteLeaderboardState.data.get(
          selectedEpoch.epoch
        )
      };
    }

    const currentEpoch = context?.currentEpochState.epoch;
    if (!context || currentEpoch === null || currentEpoch === undefined)
      return {
        resolvedEpoch: undefined,
        leaderboardData: undefined
      };

    return {
      resolvedEpoch: currentEpoch,
      leaderboardData: context.epochVoteLeaderboardState.data.get(currentEpoch)
    };
  }, [context, selectedEpoch]);

  // Computed independently from columns so a refresh that swaps in new
  // records doesn't churn the column array — column definitions can
  // stay stable across data updates and TanStack matches columns by
  // their explicit ids rather than by function-reference identity.
  const subsequentTies = useMemo(
    () => computeSubsequentTies(leaderboardData?.records ?? []),
    [leaderboardData]
  );
  const idealRecord = useMemo(
    () =>
      leaderboardData?.records.find(
        record => record.voteAddress === IDEAL_RECORD_KEY
      ),
    [leaderboardData]
  );
  const computedTableColumns = useMemo(() => {
    return createEpochVotingLeaderboardTableColumns(
      idealRecord,
      resolvedEpoch,
      subsequentTies
    );
  }, [idealRecord, resolvedEpoch, subsequentTies]);

  const tableData = useMemo(() => {
    return leaderboardData?.records || [];
  }, [leaderboardData]);

  const goToEpoch = (epoch: number | undefined) => {
    if (epoch === undefined) {
      setSelectedEpoch({ current: true, epoch: undefined });
      navigate('/leaderboards/voting');
      return;
    }
    setSelectedEpoch({ current: false, epoch });
    navigate(`/leaderboards/voting/epoch/${epoch}`);
  };

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (!value) {
      goToEpoch(undefined);
      return;
    }
    goToEpoch(Number.parseInt(value));
  };

  // On an Alpenglow cluster the Tower picker stops at the last Tower epoch.
  const { alpenglowActive, lastTowerEpoch } = useConsensus();
  const towerLatest = alpenglowActive
    ? lastTowerEpoch
    : (context?.currentEpochState.epoch ?? null);
  const epochOptions = useEpochSelectOptions({
    currentEpoch: towerLatest,
    resolvedEpoch,
    latestSuffix: alpenglowActive ? ' (last Tower)' : undefined
  });

  const epochTable = useAdvanceTable({
    data: tableData,
    columns: computedTableColumns,
    pageSize: 50,
    pagination: true,
    sortable: true,
    selection: false,
    getRowId: row => row.voteAddress,
    // Switching epochs is a new data set, so start at page 1; an auto-refresh
    // of the same epoch leaves the reader where they were.
    resetPageKey: resolvedEpoch,
    initialState: { rowPinning: { top: [IDEAL_RECORD_KEY] } }
  });

  const handleSearchInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    epochTable.setGlobalFilter(e.target.value || undefined);
  };

  const isLoadingEpoch = leaderboardData === undefined;
  // The ideal vote-stats series carries `lastUploadedBucket` per epoch (0..431);
  // anything below 431 means the epoch hasn't finished uploading.
  const idealEpochStats = useMemo(() => {
    if (!context || resolvedEpoch === undefined) return undefined;
    const series = context.epochVoteStatsState.data.get(IDEAL_RECORD_KEY);
    return series?.find(entry => entry.epoch === resolvedEpoch);
  }, [context, resolvedEpoch]);

  if (!context) return <div>Loading...</div>;

  let { epochVoteLeaderboardState: epochLeaderboardState } = context;

  if (epochLeaderboardState.error)
    return <div>Error: {epochLeaderboardState.error}</div>;

  const isEmptyEpoch =
    leaderboardData !== undefined && leaderboardData.records.length === 0;

  const currentEpoch = context.currentEpochState.epoch;
  const isCurrent = currentEpoch !== null && resolvedEpoch === currentEpoch;
  const isIncomplete =
    idealEpochStats !== undefined && idealEpochStats.lastUploadedBucket < 431;
  const hasMissingData = hasMissingBlockData(resolvedEpoch);
  const validatorCount = leaderboardData
    ? leaderboardData.records.filter(r => r.voteAddress !== IDEAL_RECORD_KEY)
        .length
    : undefined;

  const breadcrumbItems: Crumb[] = [
    { label: 'Home', url: '/' },
    resolvedEpoch !== undefined
      ? { label: 'Voting', url: '/leaderboards/voting' }
      : { label: 'Voting', active: true }
  ];
  if (resolvedEpoch !== undefined) {
    breadcrumbItems.push({
      label: `Epoch ${resolvedEpoch}`,
      active: true
    });
  }

  return (
    <div>
      <PageBreadcrumb items={breadcrumbItems} />
      <div className="mb-9">
        <Row className="align-items-start justify-content-between mt-1 mb-4 g-3">
          <Col xs="auto">
            <h3>Voting Leaderboard</h3>
            <p className="text-body-tertiary lh-sm mb-0 mt-1">
              Validators ranked by earned vote credits
              {validatorCount !== undefined && (
                <> · {validatorCount.toLocaleString()} validators</>
              )}
            </p>
          </Col>
        </Row>

        <Row className="page-header align-items-start justify-content-between g-3">
          <SearchBox placeholder="Search" onChange={handleSearchInputChange} />
          <Col xs="auto">
            <div className="d-flex align-items-center gap-1">
              <Button
                variant="soft-secondary"
                className="btn-sm d-inline-flex align-items-center"
                disabled={resolvedEpoch === undefined || resolvedEpoch <= 0}
                onClick={() =>
                  resolvedEpoch !== undefined && goToEpoch(resolvedEpoch - 1)
                }
                aria-label="Previous epoch"
                title="Previous epoch"
              >
                <FeatherIcon icon="chevron-left" size={14} />
              </Button>
              <Form.Select
                size="sm"
                style={{ width: 'auto' }}
                onChange={handleSelectChange}
                value={resolvedEpoch ?? ''}
              >
                {epochOptions.map((option, index) => (
                  <option
                    key={index}
                    value={option.value ?? ''}
                    disabled={option.disabled}
                  >
                    {option.label}
                  </option>
                ))}
              </Form.Select>
              <Button
                variant="soft-secondary"
                className="btn-sm d-inline-flex align-items-center"
                disabled={
                  resolvedEpoch === undefined ||
                  towerLatest === null ||
                  resolvedEpoch >= towerLatest
                }
                onClick={() =>
                  resolvedEpoch !== undefined && goToEpoch(resolvedEpoch + 1)
                }
                aria-label="Next epoch"
                title="Next epoch"
              >
                <FeatherIcon icon="chevron-right" size={14} />
              </Button>
            </div>
          </Col>
        </Row>

        {!isLoadingEpoch && !isEmptyEpoch && !hasMissingData && isCurrent && (
          <div className="mx-n3 px-3 border-top border-translucent py-2">
            <div className="d-flex justify-content-between align-items-center fs-9 text-body-tertiary mb-1 gap-3">
              <span>
                {idealEpochStats ? (
                  <>
                    Epoch in progress ·{' '}
                    <span className="d-none d-md-inline">
                      {(
                        (idealEpochStats.lastUploadedBucket + 1) *
                        1000
                      ).toLocaleString()}
                      /432,000 slots (
                    </span>
                    {(
                      ((idealEpochStats.lastUploadedBucket + 1) / 432) *
                      100
                    ).toFixed(1)}
                    %<span className="d-none d-md-inline">)</span>
                  </>
                ) : (
                  <>Epoch in progress · Loading…</>
                )}
              </span>
              <div className="d-flex align-items-center gap-2 flex-shrink-0">
                <span className="d-flex align-items-center gap-2">
                  {epochLeaderboardState.isLoading ? (
                    <>
                      <Spinner
                        animation="border"
                        size="sm"
                        style={{ width: 12, height: 12, borderWidth: 2 }}
                      />
                      Refreshing…
                    </>
                  ) : autoRefresh ? (
                    <>Refreshes in {secondsUntilRefresh}s</>
                  ) : (
                    <>Auto-refresh paused</>
                  )}
                </span>
                <Button
                  variant="soft-secondary"
                  className="rounded-circle d-flex align-items-center justify-content-center p-0 flex-shrink-0"
                  style={{ width: 22, height: 22 }}
                  onClick={() => setAutoRefresh(prev => !prev)}
                  aria-label={
                    autoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh'
                  }
                >
                  <FontAwesomeIcon
                    icon={autoRefresh ? faPause : faPlay}
                    style={{ fontSize: 10 }}
                  />
                </Button>
              </div>
            </div>
            <ProgressBar
              now={
                idealEpochStats
                  ? ((idealEpochStats.lastUploadedBucket + 1) / 432) * 100
                  : 100
              }
              animated={!idealEpochStats}
              striped={!idealEpochStats}
              variant="primary"
              style={{
                height: '6px',
                border: '1px solid var(--vx-border-color)'
              }}
            />
          </div>
        )}

        {!isLoadingEpoch &&
          !isEmptyEpoch &&
          !isCurrent &&
          isIncomplete &&
          !hasMissingData && (
            <WarningBanner icon="alert-triangle">
              Backfilling. Stats for this epoch are still loading.
            </WarningBanner>
          )}

        {!isLoadingEpoch && !isEmptyEpoch && hasMissingData && (
          <WarningBanner>
            Some block data for this epoch is missing. A fix is in progress.
          </WarningBanner>
        )}

        <div className="mx-n3 bg-body-emphasis border-top border-bottom border-translucent position-relative top-1">
          {isLoadingEpoch ? (
            <DelayedSpinner
              loading={isLoadingEpoch}
              label="Loading epoch data…"
            />
          ) : isEmptyEpoch ? (
            <EmptyEpochState
              epoch={resolvedEpoch}
              subject="leaderboard records"
            />
          ) : (
            <AdvanceTableProvider {...epochTable}>
              <EpochVotingLeaderboardTable />
            </AdvanceTableProvider>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClusterVoteStats;
