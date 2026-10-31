import TowerHistoricalNote from 'components/common/TowerHistoricalNote';
import ChartSkeleton from 'components/common/ChartSkeleton';
import PageBreadcrumb, { Crumb } from 'components/common/PageBreadcrumb';
import ValidatorSearch from 'components/common/ValidatorSearch';
import FeatherIcon from 'feather-icons-react';
import { hasMissingBlockData } from 'helpers/utils';
import useRefreshOnce from 'hooks/useRefreshOnce';
import { useContext, useEffect, useMemo } from 'react';
import { Col, Row, Table } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router';
import {
  EpochVoteStatsItem,
  IDEAL_RECORD_KEY,
  Validator,
  VortexDataContext
} from 'providers/VortexDataProvider';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  TooltipComponent
} from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import { useAppContext } from 'providers/AppProvider';

import { VisualMapComponent } from 'echarts/components';

echarts.use([
  TooltipComponent,
  GridComponent,
  LineChart,
  MarkAreaComponent,
  VisualMapComponent,
  CanvasRenderer,
  LegendComponent
]);

// Same rank thresholds the single-validator chart uses, so color bands
// read consistently across pages.
const RANK_BANDS: { upper: number; colorVar: string }[] = [
  { upper: 200, colorVar: 'primary' },
  { upper: 400, colorVar: 'info' }
];
const BELOW_BAND_COLOR = 'danger';

const COMPARE_EPOCH_LIMIT = 40;

const truncateAddress = (addr: string) =>
  addr.length <= 20 ? addr : `${addr.slice(0, 8)}…${addr.slice(-8)}`;

const breadcrumbItems: Crumb[] = [
  { label: 'Home', url: '/' },
  { label: 'Voting', url: '/leaderboards/voting' },
  { label: 'Compare', active: true }
];

// Pulsing skeleton bar — matches the loading treatment used by the
// other vote-stats tables.
const skeletonBar = (width: number) => (
  <span className="placeholder-glow d-inline-block">
    <span
      className="placeholder rounded bg-primary-subtle"
      style={{ width, height: 10 }}
    />
  </span>
);

const CompareTableSkeleton = ({ rowCount = 6 }: { rowCount?: number }) => (
  <div className="mx-n3 bg-body-emphasis border-top border-bottom border-translucent position-relative top-1 overflow-x-auto">
    <Table
      className="mb-0 fs-9 text-nowrap"
      style={{ minWidth: 720 }}
      hover={false}
    >
      <thead>
        <tr>
          <th rowSpan={2} className="align-middle ps-4">
            Epoch
          </th>
          <th colSpan={3} className="text-center border-start">
            —
          </th>
          <th colSpan={3} className="text-center border-start">
            —
          </th>
        </tr>
        <tr>
          <th className="text-end border-start">Rank</th>
          <th className="text-end">Missed Credits</th>
          <th className="text-end pe-4">Missed Slots</th>
          <th className="text-end border-start">Rank</th>
          <th className="text-end">Missed Credits</th>
          <th className="text-end pe-4">Missed Slots</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rowCount }).map((_, idx) => (
          <tr key={idx}>
            <td className="ps-4">{skeletonBar(36)}</td>
            <td className="text-end border-start">{skeletonBar(36)}</td>
            <td className="text-end">{skeletonBar(60)}</td>
            <td className="text-end pe-4">{skeletonBar(60)}</td>
            <td className="text-end border-start">{skeletonBar(36)}</td>
            <td className="text-end">{skeletonBar(60)}</td>
            <td className="text-end pe-4">{skeletonBar(60)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  </div>
);

const ValidatorSlot = ({
  slotLabel,
  validator,
  onClear,
  onSelect
}: {
  slotLabel: string;
  validator?: Validator;
  onClear: () => void;
  onSelect: (v: Validator) => void;
}) => {
  if (!validator) {
    return (
      <div className="bg-body-emphasis rounded border border-translucent p-3 h-100">
        <p className="text-body-tertiary fs-10 mb-2 mt-0">{slotLabel}</p>
        <ValidatorSearch onSelect={onSelect} placeholder="Pick a validator…" />
      </div>
    );
  }
  const displayName = validator.name || truncateAddress(validator.nodeAddress);
  return (
    <div className="bg-body-emphasis rounded border border-translucent p-3 h-100">
      <p className="text-body-tertiary fs-10 mb-1 mt-0">{slotLabel}</p>
      <div className="d-flex justify-content-between align-items-start gap-2">
        <div className="min-w-0">
          <Link
            to={`/validator/${validator.nodeAddress}`}
            className="text-body text-decoration-none fw-bolder fs-7 d-block text-truncate"
          >
            {displayName}
          </Link>
          <span className="text-body-tertiary font-monospace fs-10">
            {truncateAddress(validator.nodeAddress)}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-link text-body-tertiary p-0"
          onClick={onClear}
          aria-label={`Clear ${slotLabel}`}
        >
          <FeatherIcon icon="x" size={16} />
        </button>
      </div>
    </div>
  );
};

const CompareVoting = () => {
  const context = useContext(VortexDataContext);
  const {
    config: { theme },
    getThemeColor
  } = useAppContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const a = searchParams.get('a') || undefined;
  const b = searchParams.get('b') || undefined;

  const directory = context?.validatorDirectoryState;
  const directoryLoaded =
    directory?.validators !== null && directory?.validators !== undefined;

  const validatorA = useMemo(
    () => (a && directory ? directory.byNodeAddress.get(a) : undefined),
    [a, directory]
  );
  const validatorB = useMemo(
    () => (b && directory ? directory.byNodeAddress.get(b) : undefined),
    [b, directory]
  );

  // Fetch cluster baseline + each picked validator's vote-stats series.
  useEffect(() => {
    if (!context) return;
    const state = context.epochVoteStatsState;
    state.fetchData(IDEAL_RECORD_KEY);
    [validatorA, validatorB].forEach(v => {
      if (v?.voteAddress) state.fetchData(v.voteAddress);
    });
  }, [context, validatorA, validatorB]);

  // Each series' current-epoch row mutates server-side. Force-refresh once
  // per (a, b, currentEpoch) page entry so the latest epoch's stats are
  // accurate after revisits.
  const currentEpochForRefresh = context?.currentEpochState.epoch ?? null;
  useRefreshOnce(
    currentEpochForRefresh !== null
      ? `${a ?? ''}:${b ?? ''}:${currentEpochForRefresh}`
      : undefined,
    () => {
      if (!context) return;
      const state = context.epochVoteStatsState;
      state.fetchData(IDEAL_RECORD_KEY, { force: true });
      [validatorA, validatorB].forEach(v => {
        if (v?.voteAddress) state.fetchData(v.voteAddress, { force: true });
      });
    }
  );

  const setSlot = (slot: 'a' | 'b', validator?: Validator) => {
    const next = new URLSearchParams(searchParams);
    if (validator) {
      next.set(slot, validator.nodeAddress);
    } else {
      next.delete(slot);
    }
    setSearchParams(next, { replace: true });
  };

  const idealSeries = context?.epochVoteStatsState.data.get(IDEAL_RECORD_KEY);
  const seriesA = validatorA?.voteAddress
    ? context?.epochVoteStatsState.data.get(validatorA.voteAddress)
    : undefined;
  const seriesB = validatorB?.voteAddress
    ? context?.epochVoteStatsState.data.get(validatorB.voteAddress)
    : undefined;

  const comparisonRows = useMemo(() => {
    if (!idealSeries) return undefined;
    const idealByEpoch = new Map(idealSeries.map(i => [i.epoch, i]));
    const mapA = seriesA ? new Map(seriesA.map(i => [i.epoch, i])) : undefined;
    const mapB = seriesB ? new Map(seriesB.map(i => [i.epoch, i])) : undefined;
    const allEpochs = new Set<number>();
    mapA?.forEach((_, k) => allEpochs.add(k));
    mapB?.forEach((_, k) => allEpochs.add(k));
    const sorted = [...allEpochs]
      .sort((x, y) => y - x)
      .slice(0, COMPARE_EPOCH_LIMIT);
    const missed = (
      record: EpochVoteStatsItem | undefined,
      field: 'earnedCredits' | 'votedSlots',
      ideal: EpochVoteStatsItem | undefined
    ) => {
      if (!record || !ideal) return undefined;
      return Math.max(0, ideal[field] - record[field]);
    };
    return sorted.map(epoch => {
      const ideal = idealByEpoch.get(epoch);
      const rowA = mapA?.get(epoch);
      const rowB = mapB?.get(epoch);
      return {
        epoch,
        rankA: rowA?.ranking,
        missedCreditsA: missed(rowA, 'earnedCredits', ideal),
        missedSlotsA: missed(rowA, 'votedSlots', ideal),
        rankB: rowB?.ranking,
        missedCreditsB: missed(rowB, 'earnedCredits', ideal),
        missedSlotsB: missed(rowB, 'votedSlots', ideal)
      };
    });
  }, [idealSeries, seriesA, seriesB]);

  const labelA = validatorA
    ? validatorA.name || truncateAddress(validatorA.nodeAddress)
    : undefined;
  const labelB = validatorB
    ? validatorB.name || truncateAddress(validatorB.nodeAddress)
    : undefined;

  const chartOption = useMemo(() => {
    if (!comparisonRows || comparisonRows.length === 0) return undefined;
    const xs = [...comparisonRows].sort((x, y) => x.epoch - y.epoch);
    const xAxisData = xs.map(r => r.epoch);
    const allRanks = xs.flatMap(r =>
      [r.rankA, r.rankB].filter((v): v is number => typeof v === 'number')
    );
    const dataMax = allRanks.length > 0 ? Math.max(...allRanks) : 0;
    // Always show enough range to cover the worst threshold (400) plus
    // headroom into red, and grow further if either validator's rank
    // dips deeper than that.
    const yMax = Math.max(Math.ceil(dataMax * 1.1), 500);
    // Background bands: top 200 / 400 / below 400, painted under both
    // validator lines. Anchored to the first line series so we don't
    // need a dummy carrier series; using markArea here renders bands
    // once across the chart.
    const markArea = {
      silent: true,
      itemStyle: { opacity: 0.1 },
      data: [
        ...RANK_BANDS.map((b, i) => [
          {
            yAxis: i === 0 ? 0 : RANK_BANDS[i - 1].upper,
            itemStyle: { color: getThemeColor(b.colorVar) }
          },
          { yAxis: b.upper }
        ]),
        [
          {
            yAxis: RANK_BANDS[RANK_BANDS.length - 1].upper,
            itemStyle: { color: getThemeColor(BELOW_BAND_COLOR) }
          },
          { yAxis: yMax }
        ]
      ]
    };
    // Lines pick up their color from the threshold-based visualMap.
    // Symbols use the band color as the shared identity, swapped
    // between fill and outline per validator: A has a black inner with
    // a band-colored outline, B has a band-colored inner with a
    // white outline. Per-data-item itemStyle is used so the override
    // beats visualMap (which otherwise repaints the symbol fill).
    const bandColorFor = (rank: number): string => {
      for (const b of RANK_BANDS) {
        if (rank <= b.upper) return getThemeColor(b.colorVar);
      }
      return getThemeColor(BELOW_BAND_COLOR);
    };
    const symbolDataFor = (
      rank: number | undefined,
      mode: 'a' | 'b'
    ): { value: number | null; itemStyle?: Record<string, unknown> } => {
      if (rank == null) return { value: null };
      const band = bandColorFor(rank);
      return {
        value: rank,
        itemStyle:
          mode === 'a'
            ? { color: band, borderColor: '#000', borderWidth: 2 }
            : { color: '#fff', borderColor: '#000', borderWidth: 2 }
      };
    };
    const series: Array<Record<string, unknown>> = [];
    if (validatorA) {
      series.push({
        name: labelA,
        type: 'line',
        data: xs.map(r => symbolDataFor(r.rankA, 'a')),
        connectNulls: true,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2 }
      });
    }
    if (validatorB) {
      series.push({
        name: labelB,
        type: 'line',
        data: xs.map(r => symbolDataFor(r.rankB, 'b')),
        connectNulls: true,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2 }
      });
    }
    if (series.length > 0) {
      series[0].markArea = markArea;
    }
    // Legend swatches mirror the chart symbols. Each validator's most
    // recent rank picks the representative band color so the swatch
    // reads as "this is what this validator's dots look like".
    const legendItemFor = (
      label: string,
      rank: number | undefined,
      mode: 'a' | 'b'
    ): Record<string, unknown> => {
      if (rank == null) return { name: label, icon: 'circle' };
      const band = bandColorFor(rank);
      return {
        name: label,
        icon: 'circle',
        itemStyle:
          mode === 'a'
            ? { color: band, borderColor: '#000', borderWidth: 2 }
            : { color: '#fff', borderColor: '#000', borderWidth: 2 }
      };
    };
    const lastRankA = [...xs].reverse().find(r => r.rankA != null)?.rankA;
    const lastRankB = [...xs].reverse().find(r => r.rankB != null)?.rankB;
    const legendData: Array<Record<string, unknown>> = [];
    if (validatorA && labelA)
      legendData.push(legendItemFor(labelA, lastRankA, 'a'));
    if (validatorB && labelB)
      legendData.push(legendItemFor(labelB, lastRankB, 'b'));
    // Piecewise visualMap colors each line segment by its rank value
    // — same green/blue/red threshold scheme as the bands. Per-series
    // entries are produced so the legend swatches match.
    const visualMapPieces = [
      ...RANK_BANDS.map((b, i) => ({
        gte: i === 0 ? 0 : RANK_BANDS[i - 1].upper,
        lte: b.upper,
        color: getThemeColor(b.colorVar)
      })),
      {
        gt: RANK_BANDS[RANK_BANDS.length - 1].upper,
        color: getThemeColor(BELOW_BAND_COLOR)
      }
    ];
    const visualMap = series.map((_, idx) => ({
      show: false,
      type: 'piecewise',
      seriesIndex: idx,
      dimension: 1,
      pieces: visualMapPieces
    }));
    return {
      visualMap,
      tooltip: {
        trigger: 'axis',
        padding: 10,
        backgroundColor: getThemeColor('body-highlight-bg'),
        borderColor: getThemeColor('border-color'),
        textStyle: { color: getThemeColor('light-text-emphasis') },
        borderWidth: 1,
        transitionDuration: 0,
        axisPointer: { type: 'none' }
      },
      legend: {
        bottom: 0,
        data: legendData,
        itemWidth: 12,
        itemHeight: 12,
        itemGap: 16,
        textStyle: { color: getThemeColor('secondary-color') }
      },
      xAxis: {
        type: 'category',
        data: xAxisData,
        axisLabel: {
          formatter: (value: number) => `${value}`,
          color: getThemeColor('secondary-color'),
          fontFamily: 'Nunito Sans',
          fontWeight: 600,
          fontSize: 12
        },
        axisLine: {
          show: true,
          lineStyle: { color: getThemeColor('secondary-bg') }
        },
        axisTick: { show: false },
        splitLine: {
          show: true,
          lineStyle: {
            color: getThemeColor('tertiary-bg'),
            opacity: 0.45
          }
        },
        boundaryGap: false
      },
      yAxis: {
        position: 'right',
        min: 0,
        max: yMax,
        axisPointer: { type: 'none' },
        axisTick: 'none',
        splitLine: {
          lineStyle: {
            color: getThemeColor('tertiary-bg'),
            opacity: 0.45
          }
        },
        axisLine: { show: false },
        axisLabel: {
          fontFamily: 'Nunito Sans',
          fontWeight: 700,
          fontSize: 12,
          color: getThemeColor('body-color')
        }
      },
      series,
      grid: {
        right: 10,
        left: 5,
        bottom: 30,
        top: 10,
        containLabel: true
      },
      animation: false
    };
  }, [
    comparisonRows,
    validatorA,
    validatorB,
    labelA,
    labelB,
    theme,
    getThemeColor
  ]);

  const hasAnyPick = Boolean(validatorA || validatorB);
  const comparisonLoaded =
    idealSeries !== undefined &&
    (!validatorA || !validatorA.voteAddress || seriesA !== undefined) &&
    (!validatorB || !validatorB.voteAddress || seriesB !== undefined);
  const isLoadingCompare = hasAnyPick && !comparisonLoaded;
  const showComparison = hasAnyPick && comparisonLoaded;

  const fmt = (n: number | undefined) =>
    n === undefined ? '—' : n.toLocaleString();

  return (
    <div>
      <PageBreadcrumb items={breadcrumbItems} />
      <div className="mb-9">
        <Row className="page-header align-items-start justify-content-between g-3">
          <Col xs="auto">
            <h1 className="h3">Compare Validators</h1>
            <p className="text-body-tertiary lh-sm mb-0 mt-1">
              Rankings, missed credits, and missed slots over the last{' '}
              {COMPARE_EPOCH_LIMIT} epochs.
            </p>
          </Col>
        </Row>
        <TowerHistoricalNote />

        <Row className="g-3 mb-3">
          <Col xs={12} md={6}>
            <ValidatorSlot
              slotLabel="Validator A"
              validator={validatorA}
              onClear={() => setSlot('a')}
              onSelect={v => setSlot('a', v)}
            />
          </Col>
          <Col xs={12} md={6}>
            <ValidatorSlot
              slotLabel="Validator B"
              validator={validatorB}
              onClear={() => setSlot('b')}
              onSelect={v => setSlot('b', v)}
            />
          </Col>
        </Row>

        {a && directoryLoaded && !validatorA && (
          <div className="bg-warning-subtle rounded px-3 py-2 mb-3 fs-9">
            Validator A ({truncateAddress(a)}) isn't in the directory.
          </div>
        )}
        {b && directoryLoaded && !validatorB && (
          <div className="bg-warning-subtle rounded px-3 py-2 mb-3 fs-9">
            Validator B ({truncateAddress(b)}) isn't in the directory.
          </div>
        )}

        {!hasAnyPick && (
          <div className="bg-body-emphasis rounded border border-translucent p-4 text-center">
            <p className="text-body-tertiary mb-0">
              Pick one or two validators above to compare their voting
              performance over the last {COMPARE_EPOCH_LIMIT} epochs.
            </p>
          </div>
        )}

        {isLoadingCompare && (
          <>
            <div className="mb-4">
              <ChartSkeleton height={300} />
            </div>
            <CompareTableSkeleton />
          </>
        )}

        {showComparison && (!comparisonRows || comparisonRows.length === 0) && (
          <div className="bg-body-emphasis rounded border border-translucent p-4 text-center">
            <p className="text-body-tertiary mb-0">
              No vote-stats data found for the selected validator(s).
            </p>
          </div>
        )}

        {showComparison && chartOption && (
          <>
            <div className="mb-4">
              <ReactEChartsCore
                echarts={echarts}
                option={chartOption}
                style={{ height: 300, width: '100%' }}
                notMerge
              />
            </div>

            <div className="mx-n3 bg-body-emphasis border-top border-bottom border-translucent position-relative top-1 overflow-x-auto">
              <Table
                className="mb-0 fs-9 text-nowrap"
                style={{ minWidth: 720 }}
                hover
              >
                <thead>
                  <tr>
                    <th rowSpan={2} className="align-middle ps-4">
                      Epoch
                    </th>
                    <th colSpan={3} className="text-center border-start">
                      {labelA ?? '—'}
                    </th>
                    <th colSpan={3} className="text-center border-start">
                      {labelB ?? '—'}
                    </th>
                  </tr>
                  <tr>
                    <th className="text-end border-start">Rank</th>
                    <th className="text-end">Missed Credits</th>
                    <th className="text-end pe-4">Missed Slots</th>
                    <th className="text-end border-start">Rank</th>
                    <th className="text-end">Missed Credits</th>
                    <th className="text-end pe-4">Missed Slots</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows?.map(row => (
                    <tr key={row.epoch}>
                      <td className="ps-4 font-monospace">
                        <Link
                          to={`/leaderboards/voting/epoch/${row.epoch}`}
                          className="text-body text-decoration-none"
                        >
                          {row.epoch}
                          {hasMissingBlockData(row.epoch) && (
                            <span
                              className="text-warning ms-1"
                              title="Missing block data"
                            >
                              ⚠
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="text-end font-monospace border-start">
                        {fmt(row.rankA)}
                      </td>
                      <td className="text-end font-monospace">
                        {fmt(row.missedCreditsA)}
                      </td>
                      <td className="text-end font-monospace pe-4">
                        {fmt(row.missedSlotsA)}
                      </td>
                      <td className="text-end font-monospace border-start">
                        {fmt(row.rankB)}
                      </td>
                      <td className="text-end font-monospace">
                        {fmt(row.missedCreditsB)}
                      </td>
                      <td className="text-end font-monospace pe-4">
                        {fmt(row.missedSlotsB)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CompareVoting;
