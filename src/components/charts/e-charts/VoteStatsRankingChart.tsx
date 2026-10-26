import { useContext } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { useAppContext } from 'providers/AppProvider';
import { VortexDataContext } from 'providers/VortexDataProvider';
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent
} from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LineChart,
  MarkAreaComponent,
  VisualMapComponent,
  CanvasRenderer,
  LegendComponent
]);

const CHART_HEIGHT = '316px';

// Rank thresholds. Each row is the inclusive *upper bound* of a bucket;
// validators landing inside it inherit that bucket's color. The line
// segments and area fill are colored via a piecewise visualMap; the
// background bands use markArea on the same series.
const BUCKETS: { upper: number; colorVar: string; label: string }[] = [
  { upper: 200, colorVar: 'primary', label: 'Top 200' },
  { upper: 400, colorVar: 'info', label: 'Top 400' }
];
const BELOW_BUCKET = { colorVar: 'danger', label: 'Below 400' };

const VoteStatsRankingChart = ({ voteAddress }: { voteAddress: string }) => {
  const {
    config: { theme },
    getThemeColor
  } = useAppContext();
  const context = useContext(VortexDataContext);

  if (!context) return <div>Loading...</div>;

  const { epochVoteStatsState } = context;

  if (epochVoteStatsState.isLoading) return <div>Loading...</div>;
  if (epochVoteStatsState.error)
    return <div>Error: {epochVoteStatsState.error}</div>;

  const epochVoteStatsData = (
    epochVoteStatsState.data.get(voteAddress) || []
  ).filter(record => record.epoch >= 700);
  const xAxisData = epochVoteStatsData.map(record => record.epoch);
  const rankings = epochVoteStatsData.map(record => record.ranking);

  // Always show enough range to cover the worst threshold (400) plus
  // headroom into the "below 400" red zone, and grow further if the
  // validator's actual ranks go deeper than that.
  const dataMax = rankings.length > 0 ? Math.max(...rankings) : 0;
  const yMax = Math.max(Math.ceil(dataMax * 1.1), 500);

  const option = {
    color: [getThemeColor('primary')],
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
    xAxis: [
      {
        type: 'category',
        data: xAxisData,
        axisLabel: {
          interval: 1,
          show: false,
          color: getThemeColor('secondary-color'),
          align: 'left',
          fontFamily: 'Nunito Sans',
          fontWeight: 600,
          fontSize: 12.8
        },
        axisLine: {
          show: true,
          lineStyle: { color: getThemeColor('secondary-bg') }
        },
        axisTick: { show: false },
        splitLine: {
          show: true,
          interval: 0,
          lineStyle: {
            color:
              theme === 'dark'
                ? getThemeColor('body-highlight-bg')
                : getThemeColor('secondary-bg')
          }
        },
        boundaryGap: false
      },
      {
        type: 'category',
        position: 'bottom',
        data: xAxisData,
        axisLabel: {
          formatter: (value: number) => `Epoch ${value}`,
          rotate: 45,
          showMaxLabel: true,
          showMinLabel: false,
          color: getThemeColor('secondary-color'),
          align: 'right',
          fontFamily: 'Nunito Sans',
          fontWeight: 600,
          fontSize: 12.8
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        boundaryGap: false
      }
    ],
    yAxis: {
      position: 'right',
      min: 0,
      max: yMax,
      axisPointer: { type: 'none' },
      axisTick: 'none',
      splitLine: { lineStyle: { color: getThemeColor('secondary-bg') } },
      axisLine: { show: false },
      axisLabel: {
        fontFamily: 'Nunito Sans',
        fontWeight: 700,
        fontSize: 12.8,
        color: getThemeColor('body-color'),
        margin: 20,
        verticalAlign: 'middle'
      }
    },
    // Piecewise visualMap drives per-segment coloring of both the line
    // and the area fill: the value of each point is mapped to its
    // bucket color, so the line shifts color as the validator crosses
    // a threshold.
    visualMap: {
      show: false,
      type: 'piecewise',
      dimension: 1,
      pieces: [
        ...BUCKETS.map((b, i) => ({
          gte: i === 0 ? 0 : BUCKETS[i - 1].upper,
          lte: b.upper,
          color: getThemeColor(b.colorVar)
        })),
        {
          gt: BUCKETS[BUCKETS.length - 1].upper,
          color: getThemeColor(BELOW_BUCKET.colorVar)
        }
      ]
    },
    series: [
      {
        name: 'Ranking',
        type: 'line',
        data: rankings,
        showSymbol: false,
        symbol: 'circle',
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.18 },
        markArea: {
          silent: true,
          itemStyle: { opacity: 0.1 },
          data: [
            ...BUCKETS.map((b, i) => [
              {
                yAxis: i === 0 ? 0 : BUCKETS[i - 1].upper,
                itemStyle: { color: getThemeColor(b.colorVar) }
              },
              { yAxis: b.upper }
            ]),
            [
              {
                yAxis: BUCKETS[BUCKETS.length - 1].upper,
                itemStyle: { color: getThemeColor(BELOW_BUCKET.colorVar) }
              },
              { yAxis: yMax }
            ]
          ]
        }
      }
    ],
    grid: {
      right: 2,
      left: 5,
      bottom: '0px',
      top: '20px',
      containLabel: true
    },
    animation: false
  };

  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={{ height: CHART_HEIGHT, width: '100%' }}
    />
  );
};

export default VoteStatsRankingChart;
