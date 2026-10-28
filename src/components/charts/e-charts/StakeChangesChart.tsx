import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  TooltipComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useAppContext } from 'providers/AppProvider';
import { StakeChangeEpoch } from 'providers/vortex-schemas';
import { useMemo } from 'react';

echarts.use([
  BarChart,
  LineChart,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  TooltipComponent,
  CanvasRenderer
]);

// Named sources shown on their own; the rest join "Other".
const TOP_LABELS = 6;
const OTHER = 'Other';
// Distinct, theme-neutral series colors (Other is gray).
const PALETTE = [
  '#3874ff',
  '#25b003',
  '#e5780b',
  '#9a65ff',
  '#0097eb',
  '#ec1f00',
  '#8a94ad'
];

const sol = (lamports: number) => lamports / 1e9;
const fmtSol = (v: number, digits = 0) =>
  `◎${v.toLocaleString('en-US', { maximumFractionDigits: digits })}`;

/** A pool is drawn on its own in Pool Holdings once it held this share of
 *  the validator's stake in some epoch shown; smaller ones are summed. */
const MIN_POOL_SHARE = 0.01;
const OTHER_POOLS = 'Other pools';

/** Labels by total flow, largest first; beyond TOP_LABELS (and "other")
 *  fold into Other. */
const labelOrder = (items: StakeChangeEpoch[], key: 'flows' | 'pools') => {
  const total = new Map<string, number>();
  for (const it of items)
    if (key === 'flows')
      for (const l of it.byLabel)
        total.set(l.label, (total.get(l.label) ?? 0) + l.inflow + l.outflow);
    else
      for (const p of it.pools)
        // Holdings: a pool's largest share of the validator's stake in
        // any epoch shown (lamports when the share is unknown).
        total.set(
          p.label,
          Math.max(total.get(p.label) ?? 0, p.share ?? p.lamports / 1e18)
        );
  const named = [...total.entries()]
    // Flows under a whole SOL, and pools that never held MIN_POOL_SHARE
    // of the stake here, are noise (holdings fold them into Other pools).
    .filter(
      ([l, v]) =>
        l.toLowerCase() !== 'other' &&
        (key === 'flows' ? v >= 1e9 : v >= MIN_POOL_SHARE)
    )
    .sort((a, b) => b[1] - a[1])
    .map(([l]) => l);
  return named.slice(0, TOP_LABELS);
};

/** A round axis bound at or above `v` (1, 2, 2.5, 5 x 10^n). */
const niceCeil = (v: number) => {
  if (!(v > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find(m => m * mag >= v) ?? 10;
  return step * mag;
};

/** An epoch the vote account entered or left the stake set: every
 *  delegation shows as new / exited at once, which isn't flow. */
export const stakeSetMoved = (it: StakeChangeEpoch) =>
  it.stakeSet === 'entered' || it.stakeSet === 'left';

/**
 * One validator's stake per completed epoch. 'flows': inflow up and
 * outflow down (beyond reward compounding), stacked by source pool, on an
 * axis symmetric around 0, under a small panel of stake at epoch end;
 * epochs it entered or left the stake set are marked instead of drawn as
 * flows. 'holdings': each known pool's
 * stake on it, stacked. Click an epoch to select it.
 */
/** The stake and flows panels' plot left edge, so their epochs align. */
const PANEL_LEFT = 52;

const StakeChangesChart = ({
  items,
  view,
  group,
  height,
  selected,
  onSelect
}: {
  items: StakeChangeEpoch[];
  view: 'stake' | 'flows' | 'holdings';
  /** Charts sharing a group share hover (the stake and flows panels). */
  group?: string;
  /** Height in px (default by view). */
  height?: number;
  selected: number | null;
  onSelect: (epoch: number) => void;
}) => {
  const { getThemeColor } = useAppContext();
  const option = useMemo(() => {
    const epochs = items.map(it => String(it.epoch));
    const axisCommon = {
      axisLine: { lineStyle: { color: getThemeColor('tertiary-bg') } },
      axisLabel: { color: getThemeColor('secondary-color'), fontSize: 11 }
    };
    const valueAxis = (pos: 'left' | 'right', show = true) => ({
      type: 'value' as const,
      position: pos,
      show,
      // The stake line (right) fits its own range; flows (left) keep 0.
      scale: pos === 'right',
      splitLine: {
        show: pos === 'left',
        lineStyle: { color: getThemeColor('tertiary-bg'), type: 'dashed' }
      },
      axisLabel: {
        color: getThemeColor('secondary-color'),
        fontSize: 11,
        formatter: (v: number) =>
          Math.abs(v) >= 1e6
            ? `${(v / 1e6).toFixed(1)}M`
            : Math.abs(v) >= 1e3
              ? `${(v / 1e3).toFixed(0)}k`
              : String(v)
      }
    });
    const tooltipBase = {
      trigger: 'axis' as const,
      // Kept inside the chart, and no wider than the screen (a long one
      // widened the page on a phone): long lines wrap.
      confine: true,
      extraCssText:
        'max-width: min(26rem, calc(100vw - 2rem)); white-space: normal;',
      axisPointer: { type: 'shadow' as const },
      padding: 10,
      backgroundColor: getThemeColor('body-highlight-bg'),
      borderColor: getThemeColor('border-color'),
      textStyle: { color: getThemeColor('light-text-emphasis') }
    };
    const line = (l: string, v: string) =>
      `<div class="d-flex justify-content-between gap-3 fs-9"><span>${l}</span><span class="font-monospace">${v}</span></div>`;
    const signed = (v: number) =>
      `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtSol(Math.abs(v))}`;
    const highlight = selected != null ? String(selected) : null;

    if (view === 'stake') {
      // Stake at epoch end: its own panel above the flows (one y-axis per
      // panel), its own range - it needn't start at 0.
      return {
        animation: false,
        grid: { left: PANEL_LEFT, right: 12, top: 14, bottom: 8 },
        graphic: [
          {
            type: 'text',
            right: 14,
            top: 2,
            style: {
              text: 'Stake at epoch end',
              fill: getThemeColor('tertiary-color'),
              fontSize: 10
            }
          }
        ],
        tooltip: {
          ...tooltipBase,
          axisPointer: { type: 'line' as const },
          formatter: (ps: Array<{ dataIndex: number }>) => {
            const it = items[ps[0]?.dataIndex ?? 0];
            return it
              ? `<div class="fw-bold mb-1">Epoch ${it.epoch}</div>` +
                  line('Stake at end', fmtSol(sol(it.stakeAfter)))
              : '';
          }
        },
        xAxis: {
          type: 'category',
          data: epochs,
          axisTick: { show: false },
          ...axisCommon,
          axisLabel: { show: false }
        },
        yAxis: { ...valueAxis('left'), scale: true, splitNumber: 3 },
        series: [
          {
            name: 'Stake',
            type: 'line' as const,
            symbol: 'none',
            lineStyle: { width: 1.5 },
            areaStyle: { opacity: 0.08 },
            color: getThemeColor('body-emphasis-color'),
            data: items.map(it => sol(it.stakeAfter))
          }
        ]
      };
    }

    if (view === 'holdings') {
      const labels = labelOrder(items, 'pools');
      // "Helius Staked SOL (hSOL)" where the API names the pool.
      const fullNameOf = new Map<string, string>();
      for (const it of items)
        for (const p of it.pools)
          if (p.fullName && p.fullName !== p.label)
            fullNameOf.set(p.label, p.fullName);
      // The tooltip's name: the full one, with the symbol after unless
      // the full name already says it ("Marinade Native (Max Yield)").
      const named = (label: string) => {
        const f = fullNameOf.get(label);
        // Already said if every word of the symbol is in the full name
        // ("Marinade (mSOL)" in "Marinade liquid staking (mSOL)").
        const words = label.toLowerCase().match(/[a-z0-9]+/g) ?? [];
        const lower = f?.toLowerCase() ?? '';
        return !f
          ? label
          : words.every(w => lower.includes(w))
            ? f
            : `${f} (${label})`;
      };
      const rest = (it: StakeChangeEpoch) =>
        it.pools
          .filter(p => !labels.includes(p.label))
          .reduce((a, p) => a + p.lamports, 0);
      const hasRest = items.some(it => rest(it) > 0);
      const series = labels.map((label, i) => ({
        name: label,
        type: 'line' as const,
        stack: 'pools',
        areaStyle: { opacity: 0.55 },
        symbol: 'none',
        lineStyle: { width: 1 },
        color: PALETTE[i % PALETTE.length],
        data: items.map(it =>
          sol(it.pools.find(p => p.label === label)?.lamports ?? 0)
        )
      }));
      // The small pools as one series on top, so the stack is still every
      // pool's stake.
      if (hasRest)
        series.push({
          name: OTHER_POOLS,
          type: 'line' as const,
          stack: 'pools',
          areaStyle: { opacity: 0.55 },
          symbol: 'none',
          lineStyle: { width: 1 },
          color: '#8a94ad',
          data: items.map(it => sol(rest(it)))
        });
      return {
        animation: false,
        grid: { left: 8, right: 8, top: 16, bottom: 32, containLabel: true },
        legend: {
          bottom: 0,
          type: 'scroll',
          itemWidth: 10,
          itemHeight: 10,
          // The legend keeps to the short names, so it fits a row.
          textStyle: { color: getThemeColor('body-color'), fontSize: 11 }
        },
        tooltip: {
          ...tooltipBase,
          axisPointer: { type: 'line' as const },
          formatter: (ps: Array<{ dataIndex: number }>) => {
            const it = items[ps[0]?.dataIndex ?? 0];
            if (!it) return '';
            return (
              `<div class="fw-bold mb-1">Epoch ${it.epoch} · stake ${fmtSol(sol(it.stakeAfter))}</div>` +
              it.pools
                .filter(p => labels.includes(p.label))
                .map(p =>
                  line(
                    named(p.label),
                    `${fmtSol(sol(p.lamports))}${p.share != null ? ` · ${(p.share * 100).toFixed(1)}%` : ''}`
                  )
                )
                .join('') +
              (rest(it) > 0
                ? line(
                    `${OTHER_POOLS} (${it.pools.filter(p => !labels.includes(p.label)).length})`,
                    `${fmtSol(sol(rest(it)))}${it.stakeAfter ? ` · ${((rest(it) / it.stakeAfter) * 100).toFixed(1)}%` : ''}`
                  )
                : '')
            );
          }
        },
        xAxis: {
          type: 'category',
          data: epochs,
          boundaryGap: false,
          axisTick: { show: false },
          ...axisCommon
        },
        yAxis: valueAxis('left'),
        series
      };
    }

    // Flows. Epochs where the stake set moved draw no flow bars.
    const labels = labelOrder(items, 'flows');
    const flowOf = (
      it: StakeChangeEpoch,
      label: string,
      dir: 'inflow' | 'outflow'
    ) => {
      if (stakeSetMoved(it)) return 0;
      const v =
        label === OTHER
          ? it.byLabel
              .filter(l => !labels.includes(l.label))
              .reduce((a, l) => a + l[dir], 0)
          : (it.byLabel.find(l => l.label === label)?.[dir] ?? 0);
      return dir === 'inflow' ? sol(v) : -sol(v);
    };
    const all = [...labels, OTHER];
    const colorOf = (i: number, label: string) =>
      label === OTHER ? '#8a94ad' : PALETTE[i % (PALETTE.length - 1)];
    const bars = all.flatMap((label, i) =>
      (['inflow', 'outflow'] as const).map(dir => ({
        name: label,
        type: 'bar' as const,
        stack: dir,
        barMaxWidth: 14,
        color: colorOf(i, label),
        itemStyle: {
          opacity: dir === 'outflow' ? 0.65 : 1
        },
        data: items.map(it => ({
          value: flowOf(it, label, dir),
          itemStyle:
            highlight != null && String(it.epoch) !== highlight
              ? { opacity: 0.35 }
              : undefined
        }))
      }))
    );
    const moved = items.filter(stakeSetMoved);
    // The bars' axis is symmetric around 0, so in and out read alike.
    const reach = niceCeil(
      Math.max(
        ...items
          .filter(it => !stakeSetMoved(it))
          .flatMap(it => [sol(it.inflow), sol(it.outflow)]),
        0
      ) * 1.05
    );
    return {
      animation: false,
      grid: { left: PANEL_LEFT, right: 12, top: 10, bottom: 52 },
      legend: {
        bottom: 0,
        type: 'scroll',
        itemWidth: 10,
        itemHeight: 10,
        data: all,
        textStyle: { color: getThemeColor('body-color'), fontSize: 11 }
      },
      tooltip: {
        ...tooltipBase,
        formatter: (ps: Array<{ dataIndex: number }>) => {
          const it = items[ps[0]?.dataIndex ?? 0];
          if (!it) return '';
          const head = `<div class="fw-bold mb-1">Epoch ${it.epoch}</div>`;
          if (stakeSetMoved(it))
            return (
              head +
              `<div class="fs-9 mb-1">Vote account ${it.stakeSet} the stake set: every delegation shows as ${it.stakeSet === 'entered' ? 'new' : 'exited'} at once, so no flows are drawn.</div>` +
              line('Stake at end', fmtSol(sol(it.stakeAfter)))
            );
          return (
            head +
            line('Net (beyond rewards)', signed(sol(it.net))) +
            line('Inflow', fmtSol(sol(it.inflow))) +
            line('Outflow', fmtSol(sol(it.outflow))) +
            line('Rewards compounded', `+${fmtSol(sol(it.rewardGrowth))}`) +
            line('Stake at end', fmtSol(sol(it.stakeAfter))) +
            line(
              'Stakers',
              `${it.delegatorsAfter ?? '—'} (+${it.newDelegators} / −${it.exitedDelegators})`
            ) +
            `<div class="fs-10 text-body-tertiary mt-1">Click for the epoch's changes</div>`
          );
        }
      },
      xAxis: {
        type: 'category',
        data: epochs,
        axisTick: { show: false },
        ...axisCommon
      },
      yAxis: { ...valueAxis('left'), min: -reach, max: reach },
      series: [
        ...bars.map((b, i) => ({
          ...b,
          // Epochs the vote account entered or left the stake set: marked,
          // not drawn as flows.
          markArea:
            i === 0 && moved.length
              ? {
                  silent: true,
                  itemStyle: {
                    color: getThemeColor('warning'),
                    opacity: 0.15
                  },
                  label: {
                    show: true,
                    position: 'insideTop' as const,
                    color: getThemeColor('warning'),
                    fontSize: 10
                  },
                  data: moved.map(it => [
                    {
                      xAxis: String(it.epoch),
                      name: it.stakeSet === 'entered' ? 'joined' : 'left'
                    },
                    { xAxis: String(it.epoch) }
                  ])
                }
              : undefined
        }))
      ]
    };
  }, [items, view, selected, getThemeColor]);

  return (
    <ReactEChartsCore
      echarts={echarts}
      notMerge
      option={option}
      style={{ height: height ?? 280, width: '100%' }}
      onChartReady={chart => {
        if (!group) return;
        chart.group = group;
        echarts.connect(group);
      }}
      onEvents={{
        click: (p: { dataIndex: number }) => {
          const it = items[p.dataIndex];
          if (it) onSelect(it.epoch);
        }
      }}
    />
  );
};

export default StakeChangesChart;
