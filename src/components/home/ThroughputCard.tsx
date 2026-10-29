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
import usePlayhead from 'hooks/usePlayhead';
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

export type Metric = 'tps' | 'cu' | 'income';
const LABEL: Record<Metric, string> = {
  tps: 'TPS',
  cu: 'CUs',
  income: 'Income'
};
const TITLE: Record<Metric, string> = {
  tps: 'Live TPS',
  cu: 'Live CUs per Block',
  income: 'Fees per Minute'
};
const INFO: Record<Metric, string> = {
  tps: 'Transactions per second over the past 6 hours, then live, a few seconds behind the chain.',
  cu: 'Compute units per block over the past 6 hours, then live. The block limit is 100M.',
  income:
    'What leaders earned per minute over the past 6 hours (their share of fees, and MEV tips), then live. Half of every base fee is burned: shown as a line, not part of the earnings.'
};

/** The history window, and the bucket size the provider asks for at it
 *  (30 s: the API's 720-point maximum over 6 h). */
const WIN = '6h';
const WINDOW_SECS = 6 * 3600;

/** The live part: a point every LIVE_STEP_SLOTS (~2 s) behind the
 *  playhead, which trails the newest block by LIVE_LEAD slots. */
const LIVE_STEP_SLOTS = 10;
const LIVE_LEAD = 24;
const DEFAULT_SLOT_SECS = 0.4;

// The block compute-unit limit, a protocol constant (100M since SIMD-0286
// activated on mainnet): drawn as the CU chart's reference line.
const BLOCK_CU_LIMIT = 100_000_000;

/** History refresh: the API's rows move every 20 s to a minute. */
const REFRESH_MS = 60_000;

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

type Pt = [number, number];
/** A series drawn as a line over the stack, not in it (the burn). */
const unstacked = (sr: object) => 'unstacked' in sr;

/**
 * The cluster's activity over the past 6 hours, then live: history from
 * /cluster/blocks (30 s buckets; TPS from the per-minute performance
 * samples until the buckets count transactions), then the newest blocks
 * (/cluster/blocks/recent) played back slot by slot like Live Slots.
 * `metrics` picks what it can show: more than one gets a toggle in the
 * header. Block metrics need the block ingestor (not on testnet).
 */
const ThroughputCard = ({
  metrics,
  compact = false
}: {
  metrics: Metric[];
  /** The chart alone, shorter (no figures): beside Live Slots. */
  compact?: boolean;
}) => {
  const context = useContext(VortexDataContext);
  const { getThemeColor } = useAppContext();
  const [picked, setMetric] = useState<Metric>(metrics[0]);
  const slice = context?.throughputState;
  const fetchData = slice?.fetchData;
  const blocksSlice = context?.clusterBlocksState;
  const fetchBlocks = blocksSlice?.fetchData;
  const wantsTps = metrics.includes('tps');
  useEffect(() => {
    if (wantsTps) fetchData?.(WIN);
    fetchBlocks?.(WIN);
  }, [wantsTps, fetchData, fetchBlocks]);
  const blocksData = blocksSlice?.data.get(WIN);
  // Block data is only refreshed once an answer showed there is some (no
  // block ingestor: a 404, not retried every minute).
  const hasBlocks = !!blocksData;
  useLiveRefresh(true, REFRESH_MS, () => {
    if (wantsTps) fetchData?.(WIN, { force: true });
    if (hasBlocks) fetchBlocks?.(WIN, { force: true });
  });
  const data = slice?.data.get(WIN);
  const points = useMemo(() => data?.points ?? [], [data]);
  // Whole buckets only: the newest stored one is usually still filling.
  const bucketSecs = blocksData?.bucketSecs ?? 60;
  const buckets = useMemo(
    () => (blocksData?.buckets ?? []).slice(0, -1),
    [blocksData]
  );
  const tpsFromBlocks =
    buckets.length > 0 && buckets.every(b => b.transactions != null);
  // Income is a per-minute figure: its buckets summed into whole minutes.
  const minutes = useMemo(() => {
    if (bucketSecs >= 60) return buckets;
    const per = Math.round(60 / bucketSecs);
    const byMin = new Map<number, (typeof buckets)[number] & { n: number }>();
    for (const b of buckets) {
      const t = Math.floor(b.t / 60) * 60;
      const m = byMin.get(t) ?? {
        ...b,
        t,
        baseFees: 0,
        priorityFees: 0,
        mevTips: 0,
        n: 0
      };
      m.baseFees += b.baseFees;
      m.priorityFees += b.priorityFees;
      m.mevTips += b.mevTips;
      m.n += 1;
      byMin.set(t, m);
    }
    return [...byMin.values()].filter(m => m.n === per);
  }, [buckets, bucketSecs]);
  // Block metrics are offered once block data has loaded.
  const offered = metrics.filter(m => m === 'tps' || hasBlocks);
  const shown: Metric | null = offered.includes(picked)
    ? picked
    : (offered[0] ?? null);

  // The live part: the newest blocks (polled every 2 s, ~4 minutes of
  // them), played back like Live Slots: a playhead trails the newest
  // block by LIVE_LEAD slots and steps a slot per slot-time, so the
  // newest point moves every slot. Rates are over a rolling span of slots
  // at the history's grain (skipped slots count as empty time); income
  // always over a full minute.
  const recent = useRecentBlocks(true);
  const span =
    shown === 'income' ? 60 : shown === 'cu' || tpsFromBlocks ? bucketSecs : 60;
  const slotSecs =
    context?.currentEpochState.progress?.slotSeconds ?? DEFAULT_SLOT_SECS;
  const spanSlots = Math.max(1, Math.round(span / slotSecs));
  const newestSlot = recent?.length ? recent[recent.length - 1].slot : null;
  const playhead = usePlayhead(newestSlot, slotSecs * 1000, LIVE_LEAD);
  // Running sums by slot, from the oldest block held, and a slot's time
  // (slot x slot time plus an offset averaged over the blocks held, since
  // block times are whole seconds).
  const prefix = useMemo(() => {
    if (!recent?.length) return null;
    const first = recent[0].slot;
    const n = recent[recent.length - 1].slot - first + 1;
    const cols = ['tx', 'cu', 'blocks', 'fees', 'tips', 'burn'] as const;
    const p = Object.fromEntries(
      cols.map(c => [c, new Float64Array(n + 1)])
    ) as Record<(typeof cols)[number], Float64Array>;
    const by = new Map(recent.map(b => [b.slot, b]));
    for (let i = 0; i < n; i++) {
      const b = by.get(first + i);
      p.tx[i + 1] = p.tx[i] + (b?.transactions ?? 0);
      p.cu[i + 1] = p.cu[i] + (b?.computeUnits ?? 0);
      p.blocks[i + 1] = p.blocks[i] + (b ? 1 : 0);
      p.fees[i + 1] = p.fees[i] + (b ? b.baseFees + b.priorityFees : 0);
      p.tips[i + 1] = p.tips[i] + (b?.mevTips ?? 0);
      // Half of a base fee is burned; baseFees is the leader's half.
      p.burn[i + 1] = p.burn[i] + (b?.baseFees ?? 0);
    }
    let off = 0;
    for (const b of recent) off += b.t + 0.5 - b.slot * slotSecs;
    off /= recent.length;
    return {
      p,
      first,
      anchorSlot: recent[recent.length - 1].slot,
      timeOf: (slot: number) => off + slot * slotSecs
    };
  }, [recent, slotSecs]);
  const rolling = useMemo(() => {
    if (!prefix || playhead == null) return [];
    const { p, first, anchorSlot, timeOf } = prefix;
    const sum = (col: Float64Array, slot: number) =>
      col[slot - first + 1] - col[slot - first + 1 - spanSlots];
    const head = Math.min(playhead, anchorSlot);
    const firstEnd = first + spanSlots;
    if (head < firstEnd) return [];
    const ends: number[] = [];
    for (
      let e = Math.ceil(firstEnd / LIVE_STEP_SLOTS) * LIVE_STEP_SLOTS;
      e < head;
      e += LIVE_STEP_SLOTS
    )
      ends.push(e);
    ends.push(head);
    return ends.map(e => ({
      end: timeOf(e),
      tx: sum(p.tx, e),
      cu: sum(p.cu, e),
      blocks: sum(p.blocks, e),
      fees: sum(p.fees, e),
      tips: sum(p.tips, e),
      burn: sum(p.burn, e)
    }));
  }, [prefix, playhead, spanSlots]);
  const spanSecs = spanSlots * slotSecs;
  // Where the live part begins: history stops there.
  const liveFrom = rolling.length ? rolling[0].end - spanSecs : null;

  const view = useMemo(() => {
    const keep = (t: number) => liveFrom == null || t <= liveFrom;
    const latestLabel = span < 60 ? `Last ${span} s` : 'Last minute';
    const mean = (xs: number[]) =>
      xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0;
    if (shown === 'tps') {
      const series: Pt[] = [
        // The per-minute samples up to the first bucket (the block store
        // refills over 6 h after a reset), then the buckets.
        ...points
          .filter(p => keep(p.t) && (!tpsFromBlocks || p.t <= buckets[0].t))
          .map((p): Pt => [p.t, p.tps]),
        ...(tpsFromBlocks
          ? buckets
              .filter(b => keep(b.t + bucketSecs))
              .map(
                (b): Pt => [
                  b.t + bucketSecs,
                  (b.transactions ?? 0) / bucketSecs
                ]
              )
          : []),
        ...rolling.map((w): Pt => [w.end, w.tx / spanSecs])
      ];
      if (!series.length) return null;
      const vals = series.map(d => d[1]);
      return {
        figures: [
          [latestLabel, fmtTps(vals[vals.length - 1])],
          ['Average', fmtTps(mean(vals))],
          ['Peak', fmtTps(Math.max(...vals))]
        ],
        fmt: (v: number) => `${fmtTps(v)} TPS`,
        axis: (v: number) =>
          v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : `${v}`,
        series: [{ name: 'TPS', data: series }]
      };
    }
    if (shown === 'cu') {
      const series: Pt[] = [
        ...buckets
          .filter(b => keep(b.t + bucketSecs))
          .map(
            (b): Pt => [
              b.t + bucketSecs,
              b.blocks ? b.computeUnits / b.blocks : 0
            ]
          ),
        ...rolling.map((w): Pt => [w.end, w.blocks ? w.cu / w.blocks : 0])
      ];
      if (!series.length) return null;
      const vals = series.map(d => d[1]);
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
        series: [{ name: 'CUs per block', data: series }]
      };
    }
    if (shown !== 'income') return null;
    // Income per minute: whole minutes, then a rolling minute.
    const hist = minutes.filter(m => keep(m.t + 60));
    const perMin = 60 / spanSecs;
    const fees: Pt[] = [
      ...hist.map((m): Pt => [m.t + 60, m.baseFees + m.priorityFees]),
      ...rolling.map((w): Pt => [w.end, w.fees * perMin])
    ];
    const tips: Pt[] = [
      ...hist.map((m): Pt => [m.t + 60, m.mevTips]),
      ...rolling.map((w): Pt => [w.end, w.tips * perMin])
    ];
    const burned: Pt[] = [
      ...hist.map((m): Pt => [m.t + 60, m.baseFees]),
      ...rolling.map((w): Pt => [w.end, w.burn * perMin])
    ];
    if (!fees.length) return null;
    const totals = fees.map((f, i) => f[1] + tips[i][1]);
    // The 6 hours' total: their whole minutes, plus the blocks since.
    const total =
      hist.reduce((a, m) => a + m.baseFees + m.priorityFees + m.mevTips, 0) +
      (recent ?? [])
        .filter(b => liveFrom != null && b.t >= liveFrom)
        .reduce((a, b) => a + b.baseFees + b.priorityFees + b.mevTips, 0);
    return {
      figures: [
        [latestLabel, fmtSol(totals[totals.length - 1])],
        ['Per minute', fmtSol(mean(totals))],
        ['Past 6 h', fmtSol(total)]
      ],
      fmt: (v: number) => fmtSol(v),
      // Round ticks: "◎1.5", "◎3", not "◎3.00".
      axis: (v: number) =>
        `◎${(v / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
      stacked: true,
      series: [
        { name: 'Fees', data: fees },
        { name: 'MEV tips', data: tips },
        { name: 'Burned', data: burned, unstacked: true }
      ]
    };
  }, [
    shown,
    points,
    buckets,
    bucketSecs,
    tpsFromBlocks,
    minutes,
    rolling,
    span,
    spanSecs,
    recent,
    liveFrom
  ]);

  // A line's axis (not the income stack, which stands on 0): zoomed onto
  // its range - TPS moves within ~1-2k, flat from 0 - with bottom, top
  // and step on round values, so every label sits on a step.
  const zoom = (() => {
    if (!view || view.stacked) return null;
    const vals = view.series.flatMap(sr => sr.data.map(d => d[1]));
    if (!vals.length) return null;
    const lo = Math.min(...vals);
    const hi = Math.max(...vals, view.limit ?? 0);
    const range = Math.max(hi - lo, hi * 0.1, 1);
    const raw = (range * 1.3) / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step =
      [1, 2, 2.5, 5, 10].map(k => k * mag).find(x => x >= raw) ?? 10 * mag;
    const min = Math.max(0, Math.floor((lo - range * 0.15) / step) * step);
    return { min, max: Math.ceil((hi + range * 0.08) / step) * step, step };
  })();
  // The newest point, pulsing: the stack's top for income.
  const lastPoint = (() => {
    // The stack's top: the burn line isn't part of it.
    const sers = (view?.series ?? []).filter(sr => !unstacked(sr));
    const first = sers[0]?.data;
    if (!first?.length) return null;
    const t = first[first.length - 1][0] * 1000;
    const v = sers.reduce(
      (a, sr) => a + (sr.data[sr.data.length - 1]?.[1] ?? 0),
      0
    );
    return [t, view?.stacked ? v : first[first.length - 1][1]];
  })();

  // The window's start, and - for the block metrics, which come only from
  // the block store - when its history begins, if later.
  const windowFrom = Date.now() / 1000 - WINDOW_SECS;
  const historyFrom =
    shown !== 'tps' || tpsFromBlocks
      ? (blocksData?.buckets[0]?.t ?? null)
      : null;
  const filling =
    historyFrom != null && historyFrom > windowFrom + 15 * 60
      ? historyFrom
      : null;

  const primary = getThemeColor('primary');
  const burnColor = getThemeColor('tertiary-color');
  const option = {
    // Every change draws at once; the pulse on the newest point is the
    // motion (a morph made the dot trail the line).
    animation: true,
    animationDuration: 0,
    animationDurationUpdate: 0,
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
      // Always the full window, so history still filling (the block
      // store refills over 6 h after a reset) reads as a gap, not a
      // shorter chart.
      min: windowFrom * 1000,
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        fontSize: 10,
        hideOverlap: true
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: zoom ? zoom.min : 0,
      interval: zoom?.step,
      max: zoom ? zoom.max : (v: { max: number }) => niceMax(v.max),
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        fontSize: 10,
        formatter: (v: number) => view?.axis(v) ?? `${v}`
      },
      splitLine: { lineStyle: { color: getThemeColor('border-color') } }
    },
    series: [
      ...(view?.series ?? []).map((sr, i) => ({
        name: sr.name,
        // Keyed by time, so points stay matched as the line moves on.
        data: sr.data.map(([t, v]) => ({
          name: String(t),
          value: [t * 1000, v]
        })),
        type: 'line',
        symbol: 'none',
        smooth: 0.2,
        stack: view?.stacked && !unstacked(sr) ? 'income' : undefined,
        color: unstacked(sr)
          ? burnColor
          : i === 0
            ? primary
            : getThemeColor('info'),
        lineStyle: unstacked(sr)
          ? { width: 1.25, type: 'dashed' }
          : { width: 1.5 },
        // A zoomed line's area fills down to the axis bottom.
        areaStyle: unstacked(sr)
          ? undefined
          : view?.stacked
            ? { opacity: 0.35 }
            : { opacity: 0.15, origin: 'start' },
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

  const chartHeight = compact ? 125 : 200;
  // Nothing to show at all (income without a block ingestor): no card.
  if (!shown) return null;
  // Remounted (drawn at once) on a metric switch and when the history
  // arrives, so the chart never animates a swap.
  const historyLoaded = shown === 'tps' ? !!data : !!blocksData;
  return (
    <SectionCard
      title={TITLE[shown]}
      icon={shown === 'income' ? 'dollar-sign' : 'activity'}
      info={INFO[shown]}
      aside={
        offered.length > 1 ? (
          <ButtonGroup size="sm">
            {offered.map(k => (
              <ToggleButton
                key={k}
                id={`live-metric-${k}`}
                type="radio"
                name={`live-metric-${metrics.join('-')}`}
                variant="soft-secondary"
                value={k}
                checked={shown === k}
                onChange={() => setMetric(k)}
              >
                {LABEL[k]}
              </ToggleButton>
            ))}
          </ButtonGroup>
        ) : undefined
      }
    >
      <div
        className={`d-flex gap-4 mb-2${compact || shown === 'income' ? ' d-none' : ''}`}
      >
        {(
          view?.figures ?? [
            ['Last minute', '—'],
            ['Average', '—'],
            ['Peak', '—']
          ]
        ).map(([label, value]) => (
          <Figure
            key={label}
            // While the block history is still filling, the 6-hour total
            // only covers what's been collected.
            label={filling != null && label === 'Past 6 h' ? 'So far' : label}
            value={value}
          />
        ))}
      </div>
      {view ? (
        <>
          <ReactEChartsCore
            key={`${shown}-${historyLoaded ? 1 : 0}`}
            echarts={echarts}
            option={option}
            style={{ height: chartHeight, width: '100%' }}
          />
          {filling != null && shown !== 'tps' && (
            <p className="fs-10 text-body-tertiary mb-0 mt-1">
              Collecting since{' '}
              {new Date(filling * 1000).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit'
              })}
              : the block history fills the 6 hours as it goes.
            </p>
          )}
          {view.stacked && (
            <div className="d-flex gap-3 fs-10 text-body-tertiary mt-1">
              {view.series.map((sr, i) => (
                <span
                  key={sr.name}
                  className="d-inline-flex align-items-center gap-1"
                >
                  {unstacked(sr) ? (
                    <span
                      className="d-inline-block"
                      style={{
                        width: 12,
                        borderTop: `2px dashed ${burnColor}`
                      }}
                    />
                  ) : (
                    <span
                      className={`d-inline-block rounded-1 ${i === 0 ? 'bg-primary' : 'bg-info'}`}
                      style={{ width: 10, height: 10 }}
                    />
                  )}
                  {sr.name}
                </span>
              ))}
            </div>
          )}
        </>
      ) : slice?.error && shown === 'tps' ? (
        <UntrackedState>
          Throughput isn&apos;t available right now.
        </UntrackedState>
      ) : (
        <div style={{ height: chartHeight }} />
      )}
    </SectionCard>
  );
};

export default ThroughputCard;
