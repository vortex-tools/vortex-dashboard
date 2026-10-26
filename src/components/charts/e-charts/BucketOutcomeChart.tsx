import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { BucketOutcomes } from 'helpers/participation';
import { useAppContext } from 'providers/AppProvider';
import { useMemo } from 'react';

echarts.use([
  BarChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer
]);

/**
 * One validator's epoch, per 1,000-slot bucket: what went wrong - late
 * skips (skip on a slot that made the chain: the vote still pays, but
 * the validator didn't have the block in time) and missed slots (in
 * neither reward certificate: unpaid), stacked.
 * Correct votes (notarize, and skips on slots the chain skipped) aren't
 * plotted or in the tooltip. Click a bar to get its slot range.
 */
const BucketOutcomeChart = ({
  buckets,
  onBucketClick
}: {
  buckets: BucketOutcomes[];
  onBucketClick?: (b: BucketOutcomes) => void;
}) => {
  const { getThemeColor } = useAppContext();
  const option = useMemo(
    () => ({
      animation: false,
      grid: { left: 8, right: 8, top: 12, bottom: 32, containLabel: true },
      legend: {
        bottom: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: getThemeColor('body-color'), fontSize: 11 }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        padding: 10,
        backgroundColor: getThemeColor('body-highlight-bg'),
        borderColor: getThemeColor('border-color'),
        textStyle: { color: getThemeColor('light-text-emphasis') },
        formatter: (params: Array<{ dataIndex: number }>) => {
          const b = buckets[params[0]?.dataIndex ?? 0];
          if (!b) return '';
          const line = (l: string, v: number) =>
            `<div class="d-flex justify-content-between gap-3 fs-9"><span>${l}</span><span class="font-monospace">${v.toLocaleString()}</span></div>`;
          return (
            `<div class="fw-bold mb-1">Bucket ${b.bucket + 1} · slots ${b.firstSlot.toLocaleString()}–${(b.firstSlot + 999).toLocaleString()}</div>` +
            line('Skipped blocks (paid)', b.lateSkipped) +
            line('Missed (unpaid)', b.missed)
          );
        }
      },
      xAxis: {
        type: 'category',
        data: buckets.map(b => String(b.bucket + 1)),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: getThemeColor('tertiary-bg') } },
        axisLabel: { color: getThemeColor('secondary-color'), fontSize: 11 }
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: {
          lineStyle: { color: getThemeColor('tertiary-bg'), type: 'dashed' }
        },
        axisLabel: { color: getThemeColor('secondary-color'), fontSize: 11 }
      },
      series: [
        {
          name: 'Skipped blocks (paid)',
          type: 'bar',
          stack: 'x',
          barMaxWidth: 10,
          itemStyle: { color: getThemeColor('warning') },
          data: buckets.map(b => b.lateSkipped)
        },
        {
          name: 'Missed (unpaid)',
          type: 'bar',
          stack: 'x',
          barMaxWidth: 10,
          itemStyle: { color: getThemeColor('danger') },
          data: buckets.map(b => b.missed)
        }
      ]
    }),
    [buckets, getThemeColor]
  );
  return (
    <ReactEChartsCore
      echarts={echarts}
      notMerge
      option={option}
      style={{ height: 240, width: '100%' }}
      onEvents={
        onBucketClick
          ? {
              click: (p: { dataIndex: number }) => {
                const b = buckets[p.dataIndex];
                if (b) onBucketClick(b);
              }
            }
          : undefined
      }
    />
  );
};

export default BucketOutcomeChart;
