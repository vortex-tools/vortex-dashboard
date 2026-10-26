import { useMemo, useContext, useEffect, CSSProperties } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { useAppContext } from 'providers/AppProvider';
import {
  IDEAL_RECORD_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';
import { MarkLineComponent, TooltipComponent } from 'echarts/components';
import { BarChart } from 'echarts/charts';
import { latencyToCredits } from 'helpers/utils';

export type EpochVotesChartMetric = 'deductions' | 'lag';

echarts.use([TooltipComponent, MarkLineComponent, BarChart]);

type YAxisData = {
  name: string;
  color: string;
  data: number[];
  /** Which validator this series belongs to — drives ECharts' bar grouping. */
  stack: string;
  /** Soften paired-comparison B series so it reads as the secondary. */
  opacity?: number;
};

const VoterRecordSlice = {
  isPerfect: (idealLatency: number, latency: number) =>
    idealLatency !== 0 && latency !== 0 && latency - idealLatency <= 0
} as const;

const buildSeriesForValidator = (
  stackId: string,
  labelSuffix: string,
  clusterData: number[],
  validatorData: number[],
  metric: EpochVotesChartMetric,
  bucketSize: number,
  opacity?: number
): YAxisData[] => {
  const numVotes = Math.min(
    clusterData?.length || 0,
    validatorData?.length || 0
  );
  const ticks =
    Math.floor(numVotes / bucketSize) + (numVotes % bucketSize > 0 ? 1 : 0);
  if (ticks === 0) return [];

  const suffix = labelSuffix ? ` (${labelSuffix})` : '';

  if (metric === 'lag') {
    const okSeries: YAxisData = {
      name: `Ok${suffix}`,
      color: 'primary',
      data: [],
      stack: stackId,
      opacity
    };
    const slowSeries: YAxisData = {
      name: `Slow${suffix}`,
      color: 'warning',
      data: [],
      stack: stackId,
      opacity
    };
    const skippedSeries: YAxisData = {
      name: `Skipped${suffix}`,
      color: 'danger',
      data: [],
      stack: stackId,
      opacity
    };

    for (let i = 0; i < ticks; i++) {
      const clusterBucket = clusterData.slice(
        i * bucketSize,
        (i + 1) * bucketSize
      );
      const validatorBucket = validatorData.slice(
        i * bucketSize,
        (i + 1) * bucketSize
      );
      let ok = 0;
      let slow = 0;
      let skipped = 0;
      for (let j = 0; j < validatorBucket.length; j++) {
        const ideal = clusterBucket[j];
        const latency = validatorBucket[j];
        if (ideal === 0) continue;
        if (latency === 0) {
          skipped++;
          continue;
        }
        if (VoterRecordSlice.isPerfect(ideal, latency)) continue;
        const delta = latency - ideal;
        if (delta === 1) ok++;
        else if (delta > 1) slow++;
      }
      okSeries.data.push(ok);
      slowSeries.data.push(slow);
      skippedSeries.data.push(skipped);
    }

    return [okSeries, slowSeries, skippedSeries];
  }

  const slowSeries: YAxisData = {
    name: `Slow${suffix}`,
    color: 'warning',
    data: [],
    stack: stackId,
    opacity
  };
  const skippedSeries: YAxisData = {
    name: `Skipped${suffix}`,
    color: 'danger',
    data: [],
    stack: stackId,
    opacity
  };

  for (let i = 0; i < ticks; i++) {
    const clusterBucket = clusterData.slice(
      i * bucketSize,
      (i + 1) * bucketSize
    );
    const validatorBucket = validatorData.slice(
      i * bucketSize,
      (i + 1) * bucketSize
    );
    let slowSum = 0;
    let skippedSum = 0;
    for (let j = 0; j < validatorBucket.length; j++) {
      const earnedCredits = latencyToCredits(validatorBucket[j]);
      const idealCredits = latencyToCredits(clusterBucket[j]);
      const deduction = idealCredits - earnedCredits;
      if (deduction <= 0) continue;
      if (validatorBucket[j] === 0) {
        skippedSum += deduction;
      } else {
        slowSum += deduction;
      }
    }
    slowSeries.data.push(slowSum);
    skippedSeries.data.push(skippedSum);
  }

  return [slowSeries, skippedSeries];
};

const getDefaultOptions = (
  xAxisData: number[],
  yAxisDataList: YAxisData[],
  getThemeColor: (name: string) => string,
  epochStartSlot: number,
  bucketSize: number
) => {
  // Tick indices that land closest to each round multiple of 50 buckets
  // (0, 50, 100, … 400). Tick resolution is bucketSize/1000 (e.g. 8 buckets
  // per tick), so the round numbers don't fall on every tick — pick the
  // single nearest one per target so ties (100, 300) don't get dropped.
  const ROUND_STEP = 50;
  const MAX_ROUND_BUCKET = 400;
  const tickStep = bucketSize / 1000;
  const roundTickIndices = new Set<number>();
  for (let r = 0; r <= MAX_ROUND_BUCKET; r += ROUND_STEP) {
    roundTickIndices.add(Math.round(r / tickStep));
  }
  const isRoundTick = (index: number) => roundTickIndices.has(index);

  return {
    color: [getThemeColor('primary'), getThemeColor('tertiary-bg')],
    tooltip: {
      trigger: 'axis',
      padding: [7, 10],
      backgroundColor: getThemeColor('body-highlight-bg'),
      borderColor: getThemeColor('tertiary-bg'),
      textStyle: { color: getThemeColor('light-text-emphasis') },
      borderWidth: 1,
      transitionDuration: 0,
      axisPointer: {
        type: 'none'
      },
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return '';
        const slotNumber = params[0].axisValue || params[0].name;
        const bucketStart =
          Math.floor((slotNumber - epochStartSlot) / 1000) + 1;
        const bucketEnd = bucketStart + bucketSize / 1000 - 1;
        let result = `<strong>Slot: ${slotNumber.toLocaleString()}</strong><br/>`;
        result += `<strong>Buckets: ${bucketStart}-${bucketEnd}</strong><br/>`;
        params.forEach((param: any) => {
          result += `${param.marker} ${
            param.seriesName
          }: ${param.value.toLocaleString()}<br/>`;
        });
        return result;
      }
    },
    xAxis: {
      type: 'category',
      axisLabel: {
        color: getThemeColor('secondary-color'),
        fontFamily: 'Nunito Sans',
        fontWeight: 600,
        fontSize: 10.24,
        interval: (index: number) => isRoundTick(index),
        formatter: (value: number) => {
          const bucket0 = Math.floor((value - epochStartSlot) / 1000);
          return `${Math.round(bucket0 / ROUND_STEP) * ROUND_STEP}`;
        }
      },
      // x-axis vertical gridlines are drawn as a markLine on the first
      // series (see below) so they line up with the category-center label
      // positions; the built-in splitLine sits at category boundaries.
      splitLine: { show: false },
      show: true,
      data: xAxisData,
      axisLine: {
        lineStyle: {
          color: getThemeColor('tertiary-bg')
        }
      },
      axisTick: { show: false }
    },
    yAxis: {
      axisPointer: { type: 'none' },
      position: 'right',
      // Force integer steps — fractional labels like "0.5" don't make sense
      // when bars are slot counts / deduction sums.
      minInterval: 1,
      axisTick: { show: false },
      splitLine: {
        interval: 5,
        lineStyle: {
          color: getThemeColor('tertiary-bg'),
          opacity: 0.45
        }
      },
      axisLine: { show: false },
      axisLabel: {
        fontFamily: 'Nunito Sans',
        fontWeight: 700,
        fontSize: 12.8,
        color: getThemeColor('body-color'),
        margin: 12,
        verticalAlign: 'middle',
        formatter: (value: string) => `${value.toLocaleString()}`
      }
    },
    series: yAxisDataList.map(
      ({ name, color, data, stack, opacity }, seriesIndex) => ({
        name,
        type: 'bar',
        stack,
        barCategoryGap: '20%',
        cursor: 'default',
        data,
        label: {
          show: false,
          position: 'top',
          color: getThemeColor('body-color'),
          fontWeight: 'bold',
          fontSize: '10.24px'
        },
        z: 10,
        itemStyle: {
          color: getThemeColor(color),
          opacity: opacity ?? 0.8
        },
        // markLines render at category-center positions on a category x-axis,
        // matching where the round-number labels are drawn. Attach to the
        // first series only so they're not duplicated per stack.
        ...(seriesIndex === 0 && {
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: {
              color: getThemeColor('tertiary-bg'),
              opacity: 0.45
            },
            label: { show: false },
            data: Array.from(roundTickIndices)
              .sort((a, b) => a - b)
              .map(idx => ({ xAxis: idx }))
          }
        })
      })
    ),
    grid: {
      right: 0,
      left: 0,
      bottom: 0,
      // Leave room above the top gridline for the inside y-axis label, which
      // sits above its gridline (verticalAlign: 'bottom').
      top: 20,
      containLabel: true
    },
    animation: false
  };
};

const EpochVotesChart = ({
  epoch,
  style,
  voteAddress,
  bVoteAddress,
  aLabel,
  bLabel,
  metric = 'deductions'
}: {
  epoch: number;
  voteAddress: string;
  /** Optional second validator vote address for paired comparison. */
  bVoteAddress?: string;
  /** Display labels for the legend / tooltip. */
  aLabel?: string;
  bLabel?: string;
  style: CSSProperties;
  metric?: EpochVotesChartMetric;
}) => {
  const { getThemeColor } = useAppContext();
  const context = useContext(VortexDataContext);
  const EPOCH_START_SLOT = epoch * 432_000;
  const BUCKET = 8000;
  const MAX_BUCKETS = 432_000 / BUCKET;

  useEffect(() => {
    if (
      context?.epochVoteRecordState &&
      !context.epochVoteRecordState.isLoading &&
      !context.epochVoteRecordState.data.size
    ) {
      context.epochVoteRecordState.fetchData(voteAddress, epoch);
      context.epochVoteRecordState.fetchData(IDEAL_RECORD_KEY, epoch);
      if (bVoteAddress) {
        context.epochVoteRecordState.fetchData(bVoteAddress, epoch);
      }
    }
  }, [context, voteAddress, bVoteAddress, epoch]);

  const clusterData = context?.epochVoteRecordState.data
    .get(IDEAL_RECORD_KEY)
    ?.get(epoch);
  const xAxisData = useMemo(() => {
    return Array.from({ length: MAX_BUCKETS }, (_, index) => {
      return EPOCH_START_SLOT + index * BUCKET;
    });
  }, [clusterData]);

  const aData =
    context?.epochVoteRecordState.data.get(voteAddress)?.get(epoch) || [];
  const bData = bVoteAddress
    ? context?.epochVoteRecordState.data.get(bVoteAddress)?.get(epoch)
    : undefined;

  const yAxisData = useMemo<YAxisData[]>(() => {
    if (!clusterData) return [];
    const aSeries = buildSeriesForValidator(
      'A',
      bData ? aLabel || 'A' : '',
      clusterData,
      aData,
      metric,
      BUCKET
    );
    if (!bData) return aSeries;
    const bSeries = buildSeriesForValidator(
      'B',
      bLabel || 'B',
      clusterData,
      bData,
      metric,
      BUCKET,
      0.45
    );
    return [...aSeries, ...bSeries];
  }, [clusterData, aData, bData, metric, aLabel, bLabel]);

  if (!context) return <div>Loading...</div>;

  let { epochVoteRecordState } = context;

  if (epochVoteRecordState.error)
    return <div>Error: {epochVoteRecordState.error}</div>;

  return (
    <ReactEChartsCore
      echarts={echarts}
      notMerge
      showLoading={epochVoteRecordState.isLoading}
      option={getDefaultOptions(
        xAxisData,
        yAxisData,
        getThemeColor,
        EPOCH_START_SLOT,
        BUCKET
      )}
      style={style}
    />
  );
};

export default EpochVotesChart;
