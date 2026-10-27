import ReactEChartsCore from 'echarts-for-react/lib/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import SectionCard from 'components/common/SectionCard';
import UntrackedState from 'components/common/UntrackedState';
import useLiveRefresh from 'hooks/useLiveRefresh';
import { useAppContext } from 'providers/AppProvider';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useEffect, useMemo, useState } from 'react';
import { ButtonGroup, ToggleButton } from 'react-bootstrap';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

const WINDOWS = [
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
  const [win, setWin] = useState<Window>('30m');
  const slice = context?.throughputState;
  const fetchData = slice?.fetchData;
  useEffect(() => {
    fetchData?.(win);
  }, [win, fetchData]);
  useLiveRefresh(true, REFRESH_MS, () => fetchData?.(win, { force: true }));
  const data = slice?.data.get(win);
  const points = useMemo(() => data?.points ?? [], [data]);

  const stats = useMemo(() => {
    if (!points.length) return null;
    const tx = points.reduce((a, p) => a + p.transactions, 0);
    const secs = points.reduce((a, p) => a + p.periodSecs, 0);
    return {
      now: points[points.length - 1].tps,
      avg: secs ? tx / secs : 0,
      peak: Math.max(...points.map(p => p.tps))
    };
  }, [points]);

  const primary = getThemeColor('primary');
  const option = {
    animation: false,
    grid: { left: 4, right: 8, top: 12, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: getThemeColor('body-highlight-bg'),
      borderColor: getThemeColor('border-color'),
      textStyle: { color: getThemeColor('body-color') },
      valueFormatter: (v: number) => `${fmtTps(v)} TPS`
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
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        fontSize: 10,
        formatter: (v: number) =>
          v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : `${v}`
      },
      splitLine: { lineStyle: { color: getThemeColor('border-color') } }
    },
    series: [
      {
        name: 'TPS',
        type: 'line',
        symbol: 'none',
        smooth: 0.2,
        color: primary,
        lineStyle: { width: 1.5 },
        areaStyle: { opacity: 0.15 },
        data: points.map(p => [p.t * 1000, p.tps])
      }
    ]
  };

  return (
    <SectionCard
      title="Throughput"
      icon="activity"
      info="Transactions per second, a point per minute, from the cluster's performance samples (there is no finer source). Under Alpenglow votes aren't transactions, so every one counted is a user transaction. Refreshed every minute."
    >
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-2">
        <div className="d-flex gap-4">
          <Figure label="Last minute" value={stats ? fmtTps(stats.now) : '—'} />
          <Figure label="Average" value={stats ? fmtTps(stats.avg) : '—'} />
          <Figure label="Peak" value={stats ? fmtTps(stats.peak) : '—'} />
        </div>
        <ButtonGroup size="sm">
          {WINDOWS.map(([k, label]) => (
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
      {points.length ? (
        <ReactEChartsCore
          echarts={echarts}
          option={option}
          notMerge
          style={{ height: 180, width: '100%' }}
        />
      ) : slice?.error ? (
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
