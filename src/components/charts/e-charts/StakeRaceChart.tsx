import ReactEChartsCore from 'echarts-for-react/lib/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, MarkLineComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useAppContext } from 'providers/AppProvider';
import { GeoBreakdown } from 'providers/vortex-schemas';

echarts.use([BarChart, GridComponent, MarkLineComponent, CanvasRenderer]);

/** Bars per frame. */
export const RACE_BARS = 10;
/** One frame's length (ms): the bars' move takes the whole of it. */
export const RACE_FRAME_MS = 500;
/** Epochs a played frame moves on. */
export const RACE_STEP = 10;

export type RaceEntry = { key: string; name: string; share: number };

/** A breakdown's top entries, merged by name (one company's ASNs are
 *  one provider), largest first. */
export const raceEntries = (
  b: GeoBreakdown | null | undefined,
  label: (key: string, name: string | null) => string
): RaceEntry[] => {
  const by = new Map<string, RaceEntry>();
  for (const t of b?.top ?? []) {
    const name = label(t.key, t.name);
    const e = by.get(name) ?? { key: name, name, share: 0 };
    e.share += t.share;
    by.set(name, e);
  }
  return [...by.values()].sort((a, b) => b.share - a.share);
};

/** Colors for the racers (raceColors): each keeps one, and no two bars
 *  of a frame share it where the palette allows. */
const PALETTE = [
  '#3874ff',
  '#25b003',
  '#e5780b',
  '#0097eb',
  '#7c3aed',
  '#14b8a6',
  '#db2777',
  '#a16207',
  '#64748b',
  '#ec1f00',
  '#0e7490',
  '#65a30d'
];
export const raceColors = (frames: RaceEntry[][]) => {
  const color = new Map<string, string>();
  const uses = new Map<string, number>(PALETTE.map(c => [c, 0]));
  for (const f of frames) {
    const shown = f.slice(0, RACE_BARS);
    for (const e of shown) {
      if (color.has(e.key)) continue;
      // A color none of this frame's other bars has, the least used.
      const taken = new Set(shown.map(o => color.get(o.key)));
      const free = PALETTE.filter(c => !taken.has(c));
      const pick = (free.length ? free : PALETTE).reduce((a, b) =>
        (uses.get(b) ?? 0) < (uses.get(a) ?? 0) ? b : a
      );
      color.set(e.key, pick);
      uses.set(pick, (uses.get(pick) ?? 0) + 1);
    }
  }
  return color;
};

/**
 * One frame of a bar-chart race: the epoch's largest groups by share of
 * the stake, re-sorting as they move (ECharts realtimeSort), with the
 * 1/3 line (where shares come near it) - past it, one group alone could
 * halt consensus. The x-axis holds still across frames (`maxShare`).
 */
const StakeRaceChart = ({
  entries,
  maxShare,
  colors,
  third = true,
  frameMs = RACE_FRAME_MS,
  labelWidth = 150
}: {
  /** The name column's width (px), held across frames so a longer name
   *  coming in doesn't shift the axis. */
  labelWidth?: number;
  /** One frame's length: the bars' move takes all of it. */
  frameMs?: number;
  /** The 1/3 (halt) line, where shares come near it. */
  third?: boolean;
  entries: RaceEntry[];
  maxShare: number;
  /** Each racer's color (raceColors). */
  colors: Map<string, string>;
}) => {
  const { getThemeColor } = useAppContext();
  const nearThird = third && maxShare > 0.2;
  const shown = entries.slice(0, RACE_BARS);
  const option = {
    // A fixed name column (not containLabel): the axis holds still.
    grid: {
      left: labelWidth + 12,
      right: 56,
      top: 22,
      bottom: 24,
      containLabel: false
    },
    xAxis: {
      type: 'value',
      // Room for the 1/3 line where shares come near it; else the data's.
      max: nearThird ? Math.max(maxShare, 0.36) : maxShare * 1.15,
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        formatter: (v: number) => `${Math.round(v * 100)}%`
      },
      splitLine: { lineStyle: { color: getThemeColor('border-color') } }
    },
    yAxis: {
      type: 'category',
      inverse: true,
      max: RACE_BARS - 1,
      data: shown.map(e => e.name),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        color: getThemeColor('body-color'),
        width: labelWidth,
        overflow: 'truncate'
      },
      animationDuration: frameMs,
      animationDurationUpdate: frameMs
    },
    series: [
      {
        type: 'bar',
        realtimeSort: true,
        barMaxWidth: 18,
        data: shown.map(e => ({
          value: e.share,
          itemStyle: {
            color: colors.get(e.key) ?? PALETTE[PALETTE.length - 1],
            borderRadius: [0, 3, 3, 0]
          }
        })),
        label: {
          show: true,
          position: 'right',
          valueAnimation: true,
          color: getThemeColor('body-color'),
          fontFamily: 'monospace',
          formatter: (p: { value: number }) => `${(p.value * 100).toFixed(1)}%`
        },
        markLine: nearThird && {
          silent: true,
          symbol: 'none',
          lineStyle: { color: getThemeColor('danger'), type: 'dashed' },
          label: {
            formatter: '1/3',
            color: getThemeColor('danger'),
            // The y-axis is inverted: 'start' is the top.
            position: 'start'
          },
          data: [{ xAxis: 1 / 3 }]
        }
      }
    ],
    animationDuration: 0,
    animationDurationUpdate: frameMs,
    animationEasing: 'linear',
    animationEasingUpdate: 'linear'
  };
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={{ height: 320, width: '100%' }}
    />
  );
};

export default StakeRaceChart;
