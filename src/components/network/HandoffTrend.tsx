import ReactEChartsCore from 'echarts-for-react/lib/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { extraDelay, signedMs } from 'helpers/network';
import { useAppContext } from 'providers/AppProvider';
import { ValidatorPace } from 'providers/vortex-schemas';
import { useMemo } from 'react';

echarts.use([
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer
]);

const ms = (v: number | null | undefined) =>
  v == null ? '—' : `${Math.round(v).toLocaleString('en-US')} ms`;

/**
 * Its handoffs' extra delay per epoch (/validators/pace: over the
 * network floor, less that epoch's slot),
 * oldest first: in (the previous leader to it), out (it to the next
 * leader, where recorded) and the cluster's - so a move or a provider
 * change shows as a step. `onPick` opens an epoch.
 */
const HandoffTrend = ({
  pace,
  epoch,
  onPick
}: {
  pace: ValidatorPace;
  /** The epoch the tab shows, marked. */
  epoch: number | null;
  onPick?: (epoch: number) => void;
}) => {
  const { getThemeColor } = useAppContext();
  const rows = useMemo(
    () =>
      [...pace.epochs]
        .filter(e => e.slotDuration?.handoffExcessP50Ms != null)
        .sort((a, b) => a.epoch - b.epoch),
    [pace]
  );
  const hasOut = rows.some(r => r.slotDuration?.handoffOutExcessP50Ms != null);
  // Extra delay: over the floor less that epoch's slot (the cluster's
  // pace within windows).
  const extra = (r: (typeof rows)[number], v: number | null | undefined) =>
    extraDelay(v, r.cluster?.inWindow?.p50Ms);
  const option = useMemo(() => {
    const series = [
      {
        name: 'From previous leader',
        color: getThemeColor('primary'),
        data: rows.map(r => extra(r, r.slotDuration?.handoffExcessP50Ms))
      },
      ...(hasOut
        ? [
            {
              name: 'To next leader',
              color: getThemeColor('info'),
              data: rows.map(r =>
                extra(r, r.slotDuration?.handoffOutExcessP50Ms)
              )
            }
          ]
        : []),
      {
        name: 'Cluster',
        color: getThemeColor('secondary'),
        dashed: true,
        data: rows.map(r => extra(r, r.cluster?.handoffExcessP50Ms))
      }
    ];
    return {
      animation: false,
      grid: { left: 4, right: 8, top: 28, bottom: 4, containLabel: true },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { color: getThemeColor('tertiary-color'), fontSize: 11 }
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: getThemeColor('body-highlight-bg'),
        borderColor: getThemeColor('border-color'),
        textStyle: { color: getThemeColor('body-color'), fontSize: 12 },
        formatter: (ps: Array<{ dataIndex: number }>) => {
          const r = rows[ps[0]?.dataIndex ?? 0];
          if (!r) return '';
          const d = r.slotDuration;
          return [
            `<b>Epoch ${r.epoch}</b>${r.complete ? '' : ' (so far)'} · extra delay`,
            `From previous leader ${signedMs(extra(r, d?.handoffExcessP50Ms))} (${(d?.handoff?.count ?? 0).toLocaleString()} handoffs)`,
            ...(d?.handoffOutExcessP50Ms != null
              ? [
                  `To next leader ${signedMs(extra(r, d.handoffOutExcessP50Ms))} (${(d.handoffOut?.count ?? 0).toLocaleString()})`
                ]
              : []),
            `Cluster ${signedMs(extra(r, r.cluster?.handoffExcessP50Ms))}`
          ].join('<br/>');
        }
      },
      xAxis: {
        type: 'category',
        data: rows.map(r => String(r.epoch)),
        axisTick: { show: false },
        axisLabel: { color: getThemeColor('tertiary-color'), fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: {
          color: getThemeColor('tertiary-color'),
          fontSize: 10,
          formatter: (v: number) => `${v} ms`
        },
        splitLine: { lineStyle: { color: getThemeColor('border-color') } }
      },
      series: series.map(s => ({
        name: s.name,
        type: 'line',
        connectNulls: true,
        symbol: 'circle',
        symbolSize: (_: unknown, p: { dataIndex: number }) =>
          rows[p.dataIndex]?.epoch === epoch ? 8 : 4,
        color: s.color,
        lineStyle: { width: 2, type: s.dashed ? 'dashed' : 'solid' },
        data: s.data
      }))
    };
    // extra reads rows' own fields.
  }, [rows, hasOut, epoch, getThemeColor]);
  if (rows.length < 2) return null;
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      style={{ height: 220, width: '100%' }}
      onEvents={
        onPick
          ? {
              click: (p: { dataIndex: number }) => {
                const r = rows[p.dataIndex];
                if (r) onPick(r.epoch);
              }
            }
          : undefined
      }
    />
  );
};

export default HandoffTrend;
