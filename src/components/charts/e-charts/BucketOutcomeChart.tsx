import ReactEChartsCore from 'echarts-for-react/lib/core';
import { slotText } from 'helpers/slot';
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
  const { getThemeColor, isDark } = useAppContext();
  // Misses by cause where the buckets carry it, colored as Divergent
  // Votes' chips: late red, left out orange, offline magenta; the
  // unclassified rest red too.
  const split = buckets.some(b => b.missedBy);
  const misses = split
    ? [
        {
          name: 'Late',
          // Light mode: a deep red and a light orange, so the two read
          // apart (the theme's red and orange sit too close).
          color: isDark ? getThemeColor('danger') : '#c92a2a',
          data: buckets.map(b => b.missedBy?.late ?? 0)
        },
        {
          name: 'Left out',
          color: isDark ? '#ffa94d' : '#ff922b',
          data: buckets.map(b => b.missedBy?.thin ?? 0)
        },
        {
          name: 'Offline',
          color: isDark ? '#e26bd0' : '#b5179e',
          data: buckets.map(b => b.missedBy?.offline ?? 0)
        },
        {
          name: 'Missed',
          color: isDark ? getThemeColor('danger') : '#c92a2a',
          data: buckets.map(b =>
            b.missedBy
              ? b.missed -
                b.missedBy.late -
                b.missedBy.thin -
                b.missedBy.offline
              : b.missed
          )
        }
      ].filter(m => m.data.some(v => v > 0))
    : [
        {
          name: 'Missed (unpaid)',
          color: getThemeColor('danger'),
          data: buckets.map(b => b.missed)
        }
      ];
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
        confine: true,
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
            `<div class="fw-bold mb-1">Bucket ${b.bucket + 1} · slots ${slotText(b.firstSlot)}–${slotText(b.firstSlot + 999)}</div>` +
            line('Voted skip (paid)', b.lateSkipped) +
            (b.missedBy
              ? line('Late (unpaid)', b.missedBy.late) +
                line('Left out (unpaid)', b.missedBy.thin) +
                line('Offline (unpaid)', b.missedBy.offline) +
                (b.missed -
                  b.missedBy.late -
                  b.missedBy.thin -
                  b.missedBy.offline >
                0
                  ? line(
                      'Missed, cause not known',
                      b.missed -
                        b.missedBy.late -
                        b.missedBy.thin -
                        b.missedBy.offline
                    )
                  : '')
              : line('Missed (unpaid)', b.missed))
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
        // A short chart: two gridlines, so the labels don't crowd.
        splitNumber: 2,
        splitLine: {
          lineStyle: { color: getThemeColor('tertiary-bg'), type: 'dashed' }
        },
        axisLabel: { color: getThemeColor('secondary-color'), fontSize: 11 }
      },
      series: [
        {
          name: 'Voted skip (paid)',
          type: 'bar',
          stack: 'x',
          barMaxWidth: 10,
          // Amber, apart from Left out's orange.
          itemStyle: { color: isDark ? '#ffd43b' : '#fcc419' },
          data: buckets.map(b => b.lateSkipped)
        },
        ...misses.map(m => ({
          name: m.name,
          type: 'bar',
          stack: 'x',
          barMaxWidth: 10,
          itemStyle: { color: m.color },
          data: m.data
        }))
      ]
    }),
    [buckets, getThemeColor, misses, isDark]
  );
  return (
    <ReactEChartsCore
      echarts={echarts}
      notMerge
      option={option}
      style={{ height: 120, width: '100%' }}
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
