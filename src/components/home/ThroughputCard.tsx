import ReactEChartsCore from 'echarts-for-react/lib/core';
import { EffectScatterChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  MarkLineComponent,
  TooltipComponent
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import SectionCard from 'components/common/SectionCard';
import UntrackedState from 'components/common/UntrackedState';
import useLiveRefresh from 'hooks/useLiveRefresh';
import useRecentBlocks from 'hooks/useRecentBlocks';
import { useAppContext } from 'providers/AppProvider';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useEffect, useMemo, useState } from 'react';
import { ButtonGroup, ToggleButton } from 'react-bootstrap';

echarts.use([
  EffectScatterChart,
  LineChart,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer
]);

const METRICS = [
  ['tps', 'TPS'],
  ['cu', 'CUs'],
  ['income', 'Income']
] as const;
type Metric = (typeof METRICS)[number][0];
const TITLE: Record<Metric, string> = {
  tps: 'Live TPS',
  cu: 'Live CUs per Block',
  income: 'Live Block Income'
};
const INFO: Record<Metric, string> = {
  tps: "Transactions per second: a point per minute from the cluster's performance samples, then, where the block feed is available, the last few minutes over 10-second spans of block time, a few seconds behind the chain and updated every 2 seconds. Under Alpenglow votes aren't transactions, so every one counted is a user transaction.",
  cu: 'Compute units used per block, averaged over each minute of block time, against the block limit. From the block ingestor; refreshed every minute.',
  income:
    "What leaders earned from their blocks, summed per minute of block time: fees (the leader's share of base fees after the burn, plus priority fees) and MEV tips. From the block ingestor; refreshed every minute; the minute still filling is left off."
};

/** The live part's step (s): the feed's poll. */
const TAIL_STEP = 2;

// The block compute-unit limit, a protocol constant (100M since SIMD-0286
// activated on mainnet): drawn as the CU chart's reference line.
const BLOCK_CU_LIMIT = 100_000_000;

/** A round axis top ~8% over `m`: a multiple of half its magnitude. */
const niceMax = (m: number) => {
  if (m <= 0) return 1;
  const x = m * 1.08;
  const step = 10 ** Math.floor(Math.log10(x)) / 2;
  return Math.ceil(x / step) * step;
};

const fmtCu = (v: number) =>
  v >= 1e6
    ? `${(v / 1e6).toFixed(v % 1e6 ? 1 : 0)}M`
    : `${Math.round(v / 1e3)}k`;
const fmtSol = (lamports: number) => {
  const sol = lamports / 1e9;
  return `◎${sol >= 100 ? Math.round(sol).toLocaleString() : sol.toFixed(sol >= 10 ? 1 : 2)}`;
};

const WINDOWS = [
  ['5m', '5m'],
  ['30m', '30m'],
  ['2h', '2h'],
  ['6h', '6h']
] as const;
type Window = (typeof WINDOWS)[number][0];

/** The API samples once a minute: refresh at that pace. */
const REFRESH_MS = 60_000;

const fmtTps = (v: number) =>
  v >= 10 ? Math.round(v).toLocaleString() : v.toFixed(1);

const Figure = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="fs-10 text-body-tertiary">{label}</div>
    <div className="fs-8 fw-bold font-monospace text-body-emphasis">
      {value}
    </div>
  </div>
);

/**
 * Transactions per second, minute by minute, over the last 30 minutes,
 * 2 hours or 6 hours (/cluster/throughput, from the cluster's performance
 * samples): the latest minute, the window's average and peak, and the
 * line. Refreshed every minute, as the samples are.
 */
const ThroughputCard = () => {
  const context = useContext(VortexDataContext);
  const { getThemeColor } = useAppContext();
  const [picked, setWin] = useState<Window>('30m');
  // The block feed (for the live tail; see below). The 5m window is
  // offered only while it answers: from per-minute samples alone it's
  // five points.
  const recent = useRecentBlocks(true);
  const live = !!recent?.length;
  const windows = live ? WINDOWS : WINDOWS.filter(([k]) => k !== '5m');
  const win: Window = !live && picked === '5m' ? '30m' : picked;
  const [metric, setMetric] = useState<Metric>('tps');
  const slice = context?.throughputState;
  const fetchData = slice?.fetchData;
  const blocksSlice = context?.clusterBlocksState;
  const fetchBlocks = blocksSlice?.fetchData;
  useEffect(() => {
    fetchData?.(win);
    fetchBlocks?.(win);
  }, [win, fetchData, fetchBlocks]);
  const blocksData = blocksSlice?.data.get(win);
  // Block data is only refreshed once an answer showed there is some (no
  // block ingestor: a 404, not retried every minute).
  const hasBlocks = !!blocksData;
  useLiveRefresh(true, REFRESH_MS, () => {
    fetchData?.(win, { force: true });
    if (hasBlocks) fetchBlocks?.(win, { force: true });
  });
  const data = slice?.data.get(win);
  const points = useMemo(() => data?.points ?? [], [data]);
  // Whole minutes only: the newest stored minute is usually still
  // filling (ingest runs behind the clock, so it can be partial even
  // minutes ago) - always left off.
  const minutes = useMemo(
    () => (blocksData?.minutes ?? []).slice(0, -1),
    [blocksData]
  );
  // Block metrics are offered once block data has loaded.
  const offered = hasBlocks ? METRICS : METRICS.slice(0, 1);
  const shown: Metric = hasBlocks ? metric : 'tps';

  // The live part: the newest blocks (/cluster/blocks/recent, polled
  // every 2 s, ~4 minutes of them) over a rolling span of block time,
  // stepped every 2 s, so the newest point moves each poll. The span
  // matches what it continues: a minute beside the per-minute history
  // (30m / 2h / 6h), 10 s in the 5m window, which is the live part alone.
  // Block times are whole seconds; the first second may hold only part
  // of its blocks, so spans start after it, and the newest is still
  // arriving.
  const span = win === '5m' ? 10 : 60;
  const rolling = useMemo(() => {
    if (!recent?.length) return [];
    const firstT = recent[0].t;
    const newestT = recent[recent.length - 1].t;
    const bySec = new Map<
      number,
      { tx: number; cu: number; blocks: number; fees: number; tips: number }
    >();
    for (const b of recent) {
      const x = bySec.get(b.t) ?? { tx: 0, cu: 0, blocks: 0, fees: 0, tips: 0 };
      x.tx += b.transactions;
      x.cu += b.computeUnits;
      x.blocks += 1;
      x.fees += b.baseFees + b.priorityFees;
      x.tips += b.mevTips;
      bySec.set(b.t, x);
    }
    const out: Array<{
      end: number;
      tx: number;
      cu: number;
      blocks: number;
      fees: number;
      tips: number;
    }> = [];
    const firstEnd = Math.ceil((firstT + 1 + span) / TAIL_STEP) * TAIL_STEP;
    for (let end = firstEnd; end <= newestT; end += TAIL_STEP) {
      const w = { end, tx: 0, cu: 0, blocks: 0, fees: 0, tips: 0 };
      for (let t = end - span; t < end; t++) {
        const x = bySec.get(t);
        if (!x) continue;
        w.tx += x.tx;
        w.cu += x.cu;
        w.blocks += x.blocks;
        w.fees += x.fees;
        w.tips += x.tips;
      }
      out.push(w);
    }
    return out;
  }, [recent, span]);
  // Where the live part begins: history stops there (all of it in 5m).
  const liveFrom = rolling.length ? rolling[0].end - span : null;
  const keep = (t: number) =>
    liveFrom == null ? true : win !== '5m' && t <= liveFrom;

  // Remounted (drawn at once, not animated) on a metric or window switch
  // and when that window's history arrives, so only live updates animate.
  const historyLoaded = shown === 'tps' ? !!data : !!blocksData;

  const primary = getThemeColor('primary');
  const view = useMemo(() => {
    const latestLabel =
      rolling.length && span < 60 ? `Last ${span} s` : 'Last minute';
    const mean = (xs: number[]) =>
      xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0;
    if (shown === 'tps') {
      const data: Array<[number, number]> = [
        ...points
          .filter(p => keep(p.t))
          .map((p): [number, number] => [p.t, p.tps]),
        ...rolling.map((w): [number, number] => [w.end, w.tx / span])
      ];
      if (!data.length) return null;
      const vals = data.map(d => d[1]);
      return {
        figures: [
          [latestLabel, fmtTps(vals[vals.length - 1])],
          ['Average', fmtTps(mean(vals))],
          ['Peak', fmtTps(Math.max(...vals))]
        ],
        fmt: (v: number) => `${fmtTps(v)} TPS`,
        axis: (v: number) =>
          v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : `${v}`,
        series: [{ name: 'TPS', data }]
      };
    }
    // Block metrics: the per-minute buckets (at each minute's end), then
    // the live part.
    const hist = minutes.filter(m => keep(m.t + 60));
    if (shown === 'cu') {
      const data: Array<[number, number]> = [
        ...hist.map((m): [number, number] => [
          m.t + 60,
          m.blocks ? m.computeUnits / m.blocks : 0
        ]),
        ...rolling.map((w): [number, number] => [
          w.end,
          w.blocks ? w.cu / w.blocks : 0
        ])
      ];
      if (!data.length) return null;
      const vals = data.map(d => d[1]);
      const avg = mean(vals);
      return {
        figures: [
          [latestLabel, fmtCu(vals[vals.length - 1])],
          ['Average', fmtCu(avg)],
          ['Of the limit', `${((avg / BLOCK_CU_LIMIT) * 100).toFixed(0)}%`]
        ],
        fmt: (v: number) => `${fmtCu(v)} CUs per block`,
        axis: (v: number) => fmtCu(v),
        // Drawn only when the blocks come near it (else it flattens the
        // line; the share is in the figures).
        limit:
          Math.max(...vals) > BLOCK_CU_LIMIT / 2 ? BLOCK_CU_LIMIT : undefined,
        series: [{ name: 'CUs per block', data }]
      };
    }
    // Income as a per-minute rate (a 10 s span scaled up).
    const perMin = 60 / span;
    const fees: Array<[number, number]> = [
      ...hist.map((m): [number, number] => [
        m.t + 60,
        m.baseFees + m.priorityFees
      ]),
      ...rolling.map((w): [number, number] => [w.end, w.fees * perMin])
    ];
    const tips: Array<[number, number]> = [
      ...hist.map((m): [number, number] => [m.t + 60, m.mevTips]),
      ...rolling.map((w): [number, number] => [w.end, w.tips * perMin])
    ];
    if (!fees.length) return null;
    const totals = fees.map((f, i) => f[1] + tips[i][1]);
    // The window's total: its whole minutes, plus the blocks since.
    const total =
      hist.reduce((a, m) => a + m.baseFees + m.priorityFees + m.mevTips, 0) +
      (recent ?? [])
        .filter(b => liveFrom != null && b.t >= liveFrom)
        .reduce((a, b) => a + b.baseFees + b.priorityFees + b.mevTips, 0);
    return {
      figures: [
        [latestLabel, fmtSol(totals[totals.length - 1])],
        ['Per minute', fmtSol(mean(totals))],
        ['Window total', fmtSol(total)]
      ],
      fmt: (v: number) => fmtSol(v),
      axis: (v: number) => fmtSol(v),
      stacked: true,
      series: [
        { name: 'Fees', data: fees },
        { name: 'MEV tips', data: tips }
      ]
    };
  }, [shown, points, minutes, rolling, span, win, recent, liveFrom]);
  // The newest point, pulsing: the stack's top for income.
  const lastPoint = (() => {
    const sers = view?.series ?? [];
    const first = sers[0]?.data;
    if (!first?.length) return null;
    const t = first[first.length - 1][0] * 1000;
    const v = sers.reduce(
      (a, sr) => a + (sr.data[sr.data.length - 1]?.[1] ?? 0),
      0
    );
    return [t, view?.stacked ? v : first[first.length - 1][1]];
  })();
  const option = {
    // Only new data animates: loading a window (or switching to one)
    // draws it at once; each refresh morphs the line into its new shape.
    animation: true,
    animationDuration: 0,
    animationDurationUpdate: 600,
    animationEasingUpdate: 'cubicInOut',
    grid: { left: 4, right: 8, top: 20, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: getThemeColor('body-highlight-bg'),
      borderColor: getThemeColor('border-color'),
      textStyle: { color: getThemeColor('body-color') },
      valueFormatter: (v: number) => view?.fmt(v) ?? `${v}`
    },
    xAxis: {
      type: 'time',
      splitNumber: 4,
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
      // A round top a little over the data (or the block limit, when
      // drawn), so the top label never crowds the one below it.
      max: (v: { max: number }) => niceMax(Math.max(v.max, view?.limit ?? 0)),
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        fontSize: 10,
        formatter: (v: number) => view?.axis(v) ?? `${v}`
      },
      splitLine: { lineStyle: { color: getThemeColor('border-color') } }
    },
    series: [
      ...(view?.series ?? []).map((sr, i) => ({
        ...sr,
        // Keyed by time, so an update morphs each point into its own new
        // value (not its neighbor's, as by index when the window slides).
        data: sr.data.map(([t, v]) => ({
          name: String(t),
          value: [t * 1000, v]
        })),
        type: 'line',
        symbol: 'none',
        smooth: 0.2,
        stack: view?.stacked ? 'income' : undefined,
        color: i === 0 ? primary : getThemeColor('info'),
        lineStyle: { width: 1.5 },
        areaStyle: { opacity: view?.stacked ? 0.35 : 0.15 },
        markLine:
          i === 0 && view?.limit
            ? {
                silent: true,
                symbol: 'none',
                lineStyle: {
                  color: getThemeColor('tertiary-color'),
                  type: 'dashed'
                },
                label: {
                  formatter: `block limit ${fmtCu(view.limit)}`,
                  position: 'insideEndTop',
                  fontSize: 10,
                  color: getThemeColor('tertiary-color')
                },
                data: [{ yAxis: view.limit }]
              }
            : undefined
      })),
      ...(lastPoint
        ? [
            {
              name: 'now',
              type: 'effectScatter',
              symbolSize: 7,
              color: primary,
              rippleEffect: { scale: 3, brushType: 'stroke', period: 2.5 },
              tooltip: { show: false },
              z: 5,
              data: [lastPoint]
            }
          ]
        : [])
    ]
  };

  return (
    <SectionCard title={TITLE[shown]} icon="activity" info={INFO[shown]}>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-2">
        <div className="d-flex gap-4">
          {(
            view?.figures ?? [
              ['Last minute', '—'],
              ['Average', '—'],
              ['Peak', '—']
            ]
          ).map(([label, value]) => (
            <Figure key={label} label={label} value={value} />
          ))}
        </div>
        <div className="d-flex flex-wrap gap-2">
          {offered.length > 1 && (
            <ButtonGroup size="sm">
              {offered.map(([k, label]) => (
                <ToggleButton
                  key={k}
                  id={`activity-metric-${k}`}
                  type="radio"
                  name="activity-metric"
                  variant="soft-secondary"
                  value={k}
                  checked={shown === k}
                  onChange={() => setMetric(k)}
                >
                  {label}
                </ToggleButton>
              ))}
            </ButtonGroup>
          )}
          <ButtonGroup size="sm">
            {windows.map(([k, label]) => (
              <ToggleButton
                key={k}
                id={`tps-window-${k}`}
                type="radio"
                name="tps-window"
                variant="soft-secondary"
                value={k}
                checked={win === k}
                onChange={() => setWin(k)}
              >
                {label}
              </ToggleButton>
            ))}
          </ButtonGroup>
        </div>
      </div>
      {view ? (
        <>
          <ReactEChartsCore
            key={`${shown}-${win}-${historyLoaded ? 1 : 0}`}
            echarts={echarts}
            option={option}
            style={{ height: 180, width: '100%' }}
          />
          {view.series.length > 1 && (
            <div className="d-flex gap-3 fs-10 text-body-tertiary mt-1">
              {view.series.map((sr, i) => (
                <span
                  key={sr.name}
                  className="d-inline-flex align-items-center gap-1"
                >
                  <span
                    className={`d-inline-block rounded-1 ${i === 0 ? 'bg-primary' : 'bg-info'}`}
                    style={{ width: 10, height: 10 }}
                  />
                  {sr.name}
                </span>
              ))}
            </div>
          )}
        </>
      ) : slice?.error && shown === 'tps' ? (
        <UntrackedState>
          Throughput isn&apos;t available from this API.
        </UntrackedState>
      ) : (
        <div style={{ height: 180 }} />
      )}
    </SectionCard>
  );
};

export default ThroughputCard;
