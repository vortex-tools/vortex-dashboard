import ReactEChartsCore from 'echarts-for-react/lib/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  MarkLineComponent,
  TooltipComponent
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useAppContext } from 'providers/AppProvider';
import { CHOICE } from 'components/governance/governance';
import { GovernanceProposalDetail } from 'providers/vortex-schemas';

echarts.use([
  LineChart,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer
]);

/**
 * The vote as it came in, hourly: For, Against and Abstain stacked as
 * shares of the snapshot stake (their top is the turnout), with the quorum
 * when the rule has one.
 */
const TurnoutChart = ({
  timeline,
  snapshotStake,
  quorumShare
}: {
  timeline: GovernanceProposalDetail['timeline'];
  snapshotStake: number;
  quorumShare: number | null;
}) => {
  const { getThemeColor } = useAppContext();
  const series = CHOICE.map(({ key, label: name, token: color }, i) => ({
    name,
    type: 'line',
    stack: 'vote',
    step: 'end',
    symbol: 'none',
    lineStyle: { width: 1 },
    color: getThemeColor(color),
    areaStyle: { opacity: 0.55 },
    data: timeline.map(p => [
      p.time * 1000,
      (p.tally?.[key] ?? 0) / snapshotStake
    ]),
    markLine:
      i === 0 && quorumShare != null
        ? {
            silent: true,
            symbol: 'none',
            lineStyle: { color: getThemeColor('body-color'), type: 'dashed' },
            label: {
              formatter: `quorum ${(quorumShare * 100).toFixed(1)}%`,
              position: 'insideStartTop',
              fontSize: 10,
              color: getThemeColor('tertiary-color')
            },
            data: [{ yAxis: quorumShare }]
          }
        : undefined
  }));
  const option = {
    animation: false,
    grid: { left: 4, right: 12, top: 16, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: getThemeColor('body-highlight-bg'),
      borderColor: getThemeColor('border-color'),
      textStyle: { color: getThemeColor('body-color') },
      valueFormatter: (v: number) => `${(v * 100).toFixed(1)}% of stake`
    },
    xAxis: {
      type: 'time',
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        fontSize: 10,
        hideOverlap: true
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: (v: { max: number }) =>
        Math.min(
          1,
          Math.ceil((Math.max(v.max, quorumShare ?? 0) + 0.05) * 10) / 10
        ),
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        fontSize: 10,
        formatter: (v: number) => `${Math.round(v * 100)}%`
      },
      splitLine: { lineStyle: { color: getThemeColor('border-color') } }
    },
    series
  };
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      style={{ height: 220, width: '100%' }}
    />
  );
};

export default TurnoutChart;
