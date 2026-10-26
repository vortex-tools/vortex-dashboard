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

echarts.use([
  LineChart,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer
]);

/** Turnout (share of the snapshot stake that has voted) as voting went
 *  on, with the quorum it needed. */
const TurnoutChart = ({
  points,
  quorum
}: {
  points: { t: number; share: number }[];
  quorum?: number | null;
}) => {
  const { getThemeColor } = useAppContext();
  const option = {
    animation: false,
    grid: { left: 4, right: 12, top: 16, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: getThemeColor('body-highlight-bg'),
      borderColor: getThemeColor('border-color'),
      textStyle: { color: getThemeColor('body-color') },
      valueFormatter: (v: number) => `${(v * 100).toFixed(1)}%`
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
        Math.min(1, Math.max(v.max, quorum ?? 0) + 0.05),
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        fontSize: 10,
        formatter: (v: number) => `${Math.round(v * 100)}%`
      },
      splitLine: { lineStyle: { color: getThemeColor('border-color') } }
    },
    series: [
      {
        name: 'Turnout',
        type: 'line',
        step: 'end',
        symbol: 'none',
        color: getThemeColor('primary'),
        areaStyle: { opacity: 0.12 },
        data: points.map(p => [p.t * 1000, p.share]),
        markLine:
          quorum != null
            ? {
                silent: true,
                symbol: 'none',
                lineStyle: { color: getThemeColor('warning'), type: 'dashed' },
                label: {
                  formatter: `quorum ${(quorum * 100).toFixed(0)}%`,
                  position: 'insideEndTop',
                  fontSize: 10,
                  color: getThemeColor('tertiary-color')
                },
                data: [{ yAxis: quorum }]
              }
            : undefined
      }
    ]
  };
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      style={{ height: 200, width: '100%' }}
    />
  );
};

export default TurnoutChart;
