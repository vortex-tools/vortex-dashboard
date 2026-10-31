import { DataFreshnessSublabel } from 'components/common/DataFreshness';
import UntrackedState from 'components/common/UntrackedState';
import useCluster, { BLOCK_INCOME_UNTRACKED } from 'hooks/useCluster';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Button from 'components/base/Button';
import DelayedSpinner from 'components/common/DelayedSpinner';
import EmptyEpochState from 'components/common/EmptyEpochState';
import PageBreadcrumb, { Crumb } from 'components/common/PageBreadcrumb';
import SearchBox from 'components/common/SearchBox';
import StatCard from 'components/common/StatCard';
import WarningBanner from 'components/common/WarningBanner';
import { formatLamports, hasMissingBlockData } from 'helpers/utils';
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
  useState
} from 'react';
import { Col, Form, Row } from 'react-bootstrap';
import {
  IDEAL_RECORD_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';
import EpochIncomeLeaderboardTable, {
  createIncomeLeaderboardTableColumns,
  MIN_CAPTURE_BLOCKS
} from 'components/tables/EpochIncomeLeaderboardTable';

const leaderboardBreadcrumbItems: Crumb[] = [
  { label: 'Home', url: '/' },
  { label: 'Fees', active: true }
];

interface SelectedEpoch {
  current: boolean;
  epoch?: number;
}

const IncomeLeaderboard = () => {
  const context = useContext(VortexDataContext);
  const { blockIncomeTracked } = useCluster();
  const [selectedEpoch, setSelectedEpoch] = useState<SelectedEpoch>({
    current: true
  });

  useEffect(() => {
    if (!context) return;
    if (selectedEpoch.current) {
      context.epochIncomeLeaderboardState.fetchData();
    } else if (selectedEpoch.epoch !== undefined) {
      context.epochIncomeLeaderboardState.fetchData(selectedEpoch.epoch);
    }
  }, [context, selectedEpoch]);

  // Force-refresh once per page entry while viewing the current epoch — the
  // leaderboard mutates server-side and any cached snapshot is partial.
  const currentEpochForRefresh = context?.currentEpochState.epoch ?? null;
  const viewingCurrent =
    currentEpochForRefresh !== null &&
    (selectedEpoch.current || selectedEpoch.epoch === currentEpochForRefresh);
  useRefreshOnce(
    viewingCurrent ? String(currentEpochForRefresh) : undefined,
    () => {
      if (!context) return;
      context.epochIncomeLeaderboardState.fetchData(undefined, {
        force: true
      });
    }
  );

  const { resolvedEpoch, leaderboardData } = useMemo(() => {
    if (selectedEpoch.epoch !== undefined) {
      return {
        resolvedEpoch: selectedEpoch.epoch,
        leaderboardData: context?.epochIncomeLeaderboardState.data.get(
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
      leaderboardData:
        context.epochIncomeLeaderboardState.data.get(currentEpoch)
    };
  }, [context, selectedEpoch]);

  // Capture (vortex-data c331b78), once served: rank by it, among
  // validators with enough blocks; the rest after, unranked.
  const capture = useMemo(() => {
    const records = leaderboardData?.records ?? [];
    const real = records.filter(r => r.nodeAddress !== IDEAL_RECORD_KEY);
    if (!real.some(r => r.captureTotal != null)) return null;
    const enough = (r: (typeof real)[number]) =>
      r.captureTotal != null &&
      (r.captureBlocks ?? r.confirmedSlots) >= MIN_CAPTURE_BLOCKS;
    const byCapture = (a: (typeof real)[number], b: (typeof real)[number]) =>
      (b.captureTotal ?? -1) - (a.captureTotal ?? -1);
    const ranked = real.filter(enough).sort(byCapture);
    const rest = real.filter(r => !enough(r)).sort(byCapture);
    const rankOf = new Map<string, number | null>([
      ...ranked.map((r, i): [string, number | null] => [r.nodeAddress, i + 1]),
      ...rest.map((r): [string, number | null] => [r.nodeAddress, null])
    ]);
    const vals = ranked.map(r => r.captureTotal!).sort((a, b) => a - b);
    const median = vals.length ? vals[Math.floor(vals.length / 2)] : null;
    const missed = real.reduce((a, r) => a + (r.missedToSkipsLamports ?? 0), 0);
    return { order: [...ranked, ...rest], rankOf, median, missed };
  }, [leaderboardData]);

  const computedTableColumns = useMemo(() => {
    const records = leaderboardData?.records || [];
    const clusterRecord = records.find(
      record => record.nodeAddress === IDEAL_RECORD_KEY
    );
    const real = records.filter(r => r.nodeAddress !== IDEAL_RECORD_KEY);
    const blocks = real.reduce((a, r) => a + r.confirmedSlots, 0);
    const income = real.reduce(
      (a, r) =>
        a +
        r.totalIncome.baseFees +
        r.totalIncome.priorityFees +
        r.totalIncome.mevTips,
      0
    );
    const clusterMean = clusterRecord?.meanIncome
      ? clusterRecord.meanIncome.baseFees +
        clusterRecord.meanIncome.priorityFees +
        clusterRecord.meanIncome.mevTips
      : blocks
        ? income / blocks
        : null;
    return createIncomeLeaderboardTableColumns(
      clusterRecord,
      clusterMean,
      !!capture,
      capture?.rankOf
    );
  }, [leaderboardData, capture]);

  const tableData = useMemo(() => {
    const raw = leaderboardData?.records || [];
    // Keep the cluster-baseline (IDEAL_RECORD_KEY) row through the
    // ≥10-blocks filter so it can be pinned to the top of the table
    // alongside ranked validators. Place it at index 0 so the
    // index-based rank accessor still produces sensible ranks for the
    // real validators (rank = index, with IDEAL at index 0).
    const ideal = raw.find(r => r.nodeAddress === IDEAL_RECORD_KEY);
    const others = capture
      ? capture.order.filter(r => r.confirmedSlots > 0)
      : raw.filter(
          r => r.nodeAddress !== IDEAL_RECORD_KEY && r.confirmedSlots >= 10
        );
    return ideal ? [ideal, ...others] : others;
  }, [leaderboardData, capture]);

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (!value) {
      setSelectedEpoch({ current: true, epoch: undefined });
      return;
    }
    setSelectedEpoch({
      current: false,
      epoch: Number.parseInt(value)
    });
  };

  const epochOptions = useEpochSelectOptions({
    currentEpoch: context?.currentEpochState.epoch,
    resolvedEpoch
  });

  const epochTable = useAdvanceTable({
    data: tableData,
    columns: computedTableColumns,
    pageSize: 50,
    pagination: true,
    sortable: true,
    selection: false,
    getRowId: row => row.nodeAddress,
    resetPageKey: resolvedEpoch,
    initialState: { rowPinning: { top: [IDEAL_RECORD_KEY] } }
  });

  const handleSearchInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    epochTable.setGlobalFilter(e.target.value || undefined);
  };

  const isLoadingEpoch = leaderboardData === undefined;
  // Cluster-level KPIs for the stat strip.
  const kpis = useMemo(() => {
    if (!leaderboardData) return undefined;
    const realRecords = leaderboardData.records.filter(
      r => r.nodeAddress !== IDEAL_RECORD_KEY
    );
    const clusterRecord = leaderboardData.records.find(
      r => r.nodeAddress === IDEAL_RECORD_KEY
    );
    const blocksProduced = realRecords.reduce(
      (acc, r) => acc + r.confirmedSlots,
      0
    );
    const totalRevenue = realRecords.reduce(
      (acc, r) =>
        acc +
        r.totalIncome.baseFees +
        r.totalIncome.priorityFees +
        r.totalIncome.mevTips,
      0
    );
    const clusterMedianTotal = clusterRecord
      ? clusterRecord.medianIncome.baseFees +
        clusterRecord.medianIncome.priorityFees +
        clusterRecord.medianIncome.mevTips
      : undefined;
    return {
      validators: realRecords.length,
      blocksProduced,
      totalRevenue,
      clusterMedianTotal,
      clusterMean: blocksProduced ? totalRevenue / blocksProduced : null
    };
  }, [leaderboardData]);

  if (!context) return <div>Loading...</div>;

  let { epochIncomeLeaderboardState: epochLeaderboardState } = context;

  if (epochLeaderboardState.error)
    return <div>Error: {epochLeaderboardState.error}</div>;

  const isEmptyEpoch =
    leaderboardData !== undefined && leaderboardData.records.length === 0;
  const hasMissingData = hasMissingBlockData(resolvedEpoch);

  if (!blockIncomeTracked)
    return (
      <div>
        <PageBreadcrumb items={leaderboardBreadcrumbItems} />
        <div className="mb-9">
          <h3>Fees Leaderboard</h3>
          <p className="text-body-tertiary lh-sm mb-4 mt-1">
            Validators ranked by their median block’s fees
          </p>
          <UntrackedState>{BLOCK_INCOME_UNTRACKED}</UntrackedState>
        </div>
      </div>
    );

  return (
    <div>
      <PageBreadcrumb items={leaderboardBreadcrumbItems} />
      <div className="mb-9">
        <Row className="page-header align-items-start justify-content-between g-3">
          <Col xs="auto">
            <h3>Fees Leaderboard</h3>
            <p className="text-body-tertiary lh-sm mb-0 mt-1">
              {capture
                ? 'Validators ranked by what their blocks earn against the blocks around them'
                : 'Validators ranked by their typical block\u2019s fees + tips'}
            </p>
          </Col>
        </Row>

        {kpis && (
          <Row className="g-3 mb-3">
            <Col xs={6} md={3}>
              {capture ? (
                <StatCard
                  label="Missed to Skips"
                  value={formatLamports(capture.missed, 2)}
                  sublabel="what skipped leader slots would have earned"
                />
              ) : (
                <StatCard
                  label="Validators"
                  value={kpis.validators.toLocaleString()}
                />
              )}
            </Col>
            <Col xs={6} md={3}>
              <StatCard
                label="Blocks Produced"
                value={kpis.blocksProduced.toLocaleString()}
                sublabel={
                  viewingCurrent && (
                    <DataFreshnessSublabel sources={['blocks']} />
                  )
                }
              />
            </Col>
            <Col xs={6} md={3}>
              {capture ? (
                <StatCard
                  label="Median Capture"
                  value={
                    capture.median != null
                      ? `${capture.median.toFixed(2)}×`
                      : '—'
                  }
                  sublabel="1.00× = earns like the blocks around it"
                />
              ) : (
                <StatCard
                  label="Typical Block"
                  value={
                    kpis.clusterMedianTotal !== undefined
                      ? formatLamports(kpis.clusterMedianTotal, 4)
                      : '—'
                  }
                  sublabel={
                    kpis.clusterMean != null
                      ? `cluster median · mean ${formatLamports(kpis.clusterMean, 4)}`
                      : 'cluster median'
                  }
                />
              )}
            </Col>
            <Col xs={6} md={3}>
              <StatCard
                label="Total Fees"
                value={formatLamports(kpis.totalRevenue, 2)}
                sublabel="fees + tips, every block this epoch"
              />
            </Col>
          </Row>
        )}

        <Row className="align-items-start justify-content-between mb-3 g-3">
          <SearchBox placeholder="Search" onChange={handleSearchInputChange} />
          <Col xs={12} sm={4}>
            <Form.Select
              size="sm"
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
          </Col>
        </Row>

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
              <EpochIncomeLeaderboardTable />
            </AdvanceTableProvider>
          )}
        </div>
      </div>
    </div>
  );
};

export default IncomeLeaderboard;
