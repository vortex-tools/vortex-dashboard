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

/** The live tail: TPS over a rolling TAIL_SPAN seconds of block time
 *  (whole seconds, so a span this long reads steadily), a point every
 *  TAIL_STEP seconds - the feed's poll. */
const TAIL_SPAN = 10;
const TAIL_STEP = 2;

// The block compute-unit limit, a protocol constant (100M since SIMD-0286
// activated on mainnet): drawn as the CU chart's reference line.
const BLOCK_CU_LIMIT = 100_000_000;

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

  // The live tail: the newest blocks (/cluster/blocks/recent, polled
  // every 2 s, ~4 minutes of them) as TPS over 10 s spans of block time
  // (whole seconds, so nothing finer). Where it reaches, it replaces the
  // per-minute samples. Only complete spans: one ends once a block at or
  // past its end has arrived.
  const tail = useMemo<Array<[number, number]>>(() => {
    if (!recent?.length) return [];
    const firstT = recent[0].t;
    const newestT = recent[recent.length - 1].t;
    // Transactions per second of block time, then a rolling TAIL_SPAN
    // window stepped every TAIL_STEP: a new point each poll, as smooth
    // as a 10 s average. The first second may hold only part of its
    // blocks, so windows start after it; the newest is still arriving.
    const perSec = new Map<number, number>();
    for (const b of recent)
      perSec.set(b.t, (perSec.get(b.t) ?? 0) + b.transactions);
    const out: Array<[number, number]> = [];
    const firstEnd =
      Math.ceil((firstT + 1 + TAIL_SPAN) / TAIL_STEP) * TAIL_STEP;
    for (let end = firstEnd; end <= newestT; end += TAIL_STEP) {
      let tx = 0;
      for (let t = end - TAIL_SPAN; t < end; t++) tx += perSec.get(t) ?? 0;
      out.push([end, tx / TAIL_SPAN]);
    }
    return out;
  }, [recent]);
  // The per-minute samples up to where the tail begins.
  const tailStart = tail.length ? tail[0][0] - TAIL_SPAN : null;
  const history = useMemo(
    () => (tailStart == null ? points : points.filter(p => p.t <= tailStart)),
    [points, tailStart]
  );

  const primary = getThemeColor('primary');
  const fees = (m: (typeof minutes)[number]) => m.baseFees + m.priorityFees;
  const view = useMemo(() => {
    if (shown === 'tps') {
      if (!points.length && !tail.length) return null;
      const tx = points.reduce((a, p) => a + p.transactions, 0);
      const secs = points.reduce((a, p) => a + p.periodSecs, 0);
      const latest = tail.length
        ? ['Last 10 s', fmtTps(tail[tail.length - 1][1])]
        : [
            'Last minute',
            points.length ? fmtTps(points[points.length - 1].tps) : '—'
          ];
      return {
        figures: [
          latest,
          ['Average', secs ? fmtTps(tx / secs) : '—'],
          [
            'Peak',
            points.length ? fmtTps(Math.max(...points.map(p => p.tps))) : '—'
          ]
        ],
        fmt: (v: number) => `${fmtTps(v)} TPS`,
        axis: (v: number) =>
          v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : `${v}`,
        series: [
          {
            name: 'TPS',
            // The per-minute samples, then the live 10 s tail after them.
            data: [
              ...history.map(p => [p.t * 1000, p.tps]),
              ...tail.map(([t, v]) => [t * 1000, v])
            ]
          }
        ]
      };
    }
    if (!minutes.length) return null;
    if (shown === 'cu') {
      const per = minutes.map(m => (m.blocks ? m.computeUnits / m.blocks : 0));
      const cu = minutes.reduce((a, m) => a + m.computeUnits, 0);
      const blocks = minutes.reduce((a, m) => a + m.blocks, 0);
      const avg = blocks ? cu / blocks : 0;
      return {
        figures: [
          ['Last minute', fmtCu(per[per.length - 1])],
          ['Average', fmtCu(avg)],
          ['Of the limit', `${((avg / BLOCK_CU_LIMIT) * 100).toFixed(0)}%`]
        ],
        fmt: (v: number) => `${fmtCu(v)} CUs per block`,
        axis: (v: number) => fmtCu(v),
        limit: BLOCK_CU_LIMIT,
        series: [
          {
            name: 'CUs per block',
            data: minutes.map((m, i) => [m.t * 1000, per[i]])
          }
        ]
      };
    }
    const total = minutes.reduce((a, m) => a + fees(m) + m.mevTips, 0);
    const last = minutes[minutes.length - 1];
    return {
      figures: [
        ['Last minute', fmtSol(fees(last) + last.mevTips)],
        ['Per minute', fmtSol(total / minutes.length)],
        ['Window total', fmtSol(total)]
      ],
      fmt: (v: number) => fmtSol(v),
      axis: (v: number) => fmtSol(v),
      stacked: true,
      series: [
        {
          name: 'Fees',
          data: minutes.map(m => [m.t * 1000, fees(m)])
        },
        {
          name: 'MEV tips',
          data: minutes.map(m => [m.t * 1000, m.mevTips])
        }
      ]
    };
  }, [shown, points, history, minutes, tail]);
  // The newest point, pulsing: the stack's top for income.
  const lastPoint = (() => {
    const sers = view?.series ?? [];
    const first = sers[0]?.data;
    if (!first?.length) return null;
    const t = first[first.length - 1][0];
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
      // The CU chart runs up to the block limit, so its line shows.
      max: view?.limit,
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
            key={`${shown}-${win}`}
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
