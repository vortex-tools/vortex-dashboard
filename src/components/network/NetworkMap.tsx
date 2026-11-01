import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { EffectScatterChart, LinesChart, ScatterChart } from 'echarts/charts';
import { GeoComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import {
  LeaderDivergence,
  REGION_NAME,
  Region,
  regionCenter
} from 'helpers/network';
import { coord, loadWorld } from 'helpers/worldMap';
import { useAppContext } from 'providers/AppProvider';
import { ValidatorGeo } from 'providers/vortex-schemas';
import { useEffect, useMemo, useRef, useState } from 'react';

echarts.use([
  EffectScatterChart,
  LinesChart,
  ScatterChart,
  GeoComponent,
  TooltipComponent,
  CanvasRenderer
]);

/** The world map's width to height (Antarctica dropped). */
const ASPECT = 1.9;

export type MapMode = 'handoffs' | 'divergent';

export type RegionHandoff = {
  region: Region;
  count: number;
  p50Ms: number | null;
  expectedP50Ms: number | null;
  excessP50Ms: number | null;
  /** The cluster's over-the-floor for handoffs from the same region. */
  clusterExcessP50Ms: number | null;
};

const ms = (v: number | null | undefined) =>
  v == null ? '—' : `${Math.round(v).toLocaleString('en-US')} ms`;
const pct = (x: number) =>
  `${(x * 100).toLocaleString('en-US', { maximumFractionDigits: x < 0.01 ? 2 : 1 })}%`;

/** Slower than the cluster by this much (over the floor): amber, then
 *  red. */
const SLOWER = [1.05, 1.25];
/** A leader's divergence rate from which it's red (amber below). */
const DIVERGENT_RED = 0.05;

/**
 * Where a validator sits in the network, for one epoch - kept sparse: it,
 * pulsing, and either its handoffs (a line from each region its previous
 * leaders were in, as thick as how many, colored by its time over the
 * network floor against the cluster's from the same region) or the
 * leaders it diverged on (sized by how many votes, amber or red by the
 * rate).
 */
const NetworkMap = ({
  geo,
  self,
  mode,
  handoffs,
  leaders,
  nameOf
}: {
  geo: Map<string, ValidatorGeo>;
  /** Its node address. */
  self: string;
  mode: MapMode;
  handoffs: RegionHandoff[];
  leaders: Map<string, LeaderDivergence> | null;
  nameOf: (node: string) => string;
}) => {
  const { getThemeColor, isDark } = useAppContext();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    loadWorld().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  // From the width at the map's aspect, up to a desktop height.
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const read = () => setWidth(el.clientWidth);
    const ro = new ResizeObserver(read);
    ro.observe(el);
    read();
    return () => ro.disconnect();
  }, []);
  const height =
    width != null ? Math.round(Math.min(380, width / ASPECT)) : 300;

  const option = useMemo(() => {
    const me = coord(geo.get(self));
    const tone = (excess: number | null, cluster: number | null) => {
      if (excess == null || cluster == null || cluster <= 0)
        return getThemeColor('secondary');
      const r = excess / cluster;
      return getThemeColor(
        r <= SLOWER[0] ? 'success' : r <= SLOWER[1] ? 'warning' : 'danger'
      );
    };
    const maxCount = Math.max(1, ...handoffs.map(h => h.count));
    const lines =
      mode === 'handoffs' && me
        ? handoffs
            .map(h => ({ h, from: regionCenter(h.region, geo) }))
            .filter(
              (x): x is { h: RegionHandoff; from: [number, number] } =>
                !!x.from && x.h.region !== 'unknown'
            )
        : [];
    const leaderDots =
      mode === 'divergent' && leaders
        ? [...leaders]
            .map(([node, d]) => ({ node, d, c: coord(geo.get(node)) }))
            .filter(
              (
                x
              ): x is {
                node: string;
                d: LeaderDivergence;
                c: [number, number];
              } => !!x.c && x.d.divergent > 0
            )
            .sort((a, b) => a.d.divergent - b.d.divergent)
        : [];
    const maxDivergent = Math.max(1, ...leaderDots.map(x => x.d.divergent));
    return {
      animation: false,
      tooltip: { trigger: 'item', confine: true },
      geo: {
        map: 'world',
        roam: false,
        silent: true,
        layoutCenter: ['50%', '50%'],
        layoutSize:
          width != null ? Math.min(width - 8, (height - 8) * ASPECT) : '100%',
        itemStyle: {
          areaColor: getThemeColor(isDark ? 'body-highlight-bg' : 'gray-100'),
          borderColor: getThemeColor('border-color'),
          borderWidth: 0.5
        },
        emphasis: { disabled: true }
      },
      series: [
        {
          type: 'lines',
          coordinateSystem: 'geo',
          zlevel: 1,
          lineStyle: { curveness: 0.25, opacity: 0.85 },
          tooltip: {
            formatter: (p: { dataIndex: number }) => {
              const h = lines[p.dataIndex]?.h;
              return h
                ? `<b>From ${REGION_NAME[h.region]}</b> · ${h.count.toLocaleString()} handoffs<br/>Median ${ms(h.p50Ms)} · network floor ${ms(h.expectedP50Ms)}<br/>Over the floor ${ms(h.excessP50Ms)} (cluster ${ms(h.clusterExcessP50Ms)})`
                : '';
            }
          },
          data: lines.map(({ h, from }) => ({
            coords: [from, me],
            lineStyle: {
              width: 1.5 + (3 * h.count) / maxCount,
              color: tone(h.excessP50Ms, h.clusterExcessP50Ms)
            }
          }))
        },
        {
          type: 'scatter',
          coordinateSystem: 'geo',
          zlevel: 1,
          symbolSize: (v: number[]) => 4 + 10 * Math.sqrt(v[2] / maxDivergent),
          tooltip: {
            formatter: (p: { dataIndex: number }) => {
              const x = leaderDots[p.dataIndex];
              if (!x) return '';
              const { d } = x;
              return `<b>${nameOf(x.node)}</b><br/>${d.slots.toLocaleString()} of its slots voted on · ${d.divergent ? `${d.divergent.toLocaleString()} divergent (${pct(d.divergent / d.slots)})${d.late ? `, ${d.late.toLocaleString()} too late for its block` : ''}` : 'none divergent'}`;
            }
          },
          data: leaderDots.map(({ d, c }) => ({
            value: [...c, d.divergent],
            itemStyle: {
              color: getThemeColor(
                d.divergent / d.slots >= DIVERGENT_RED ? 'danger' : 'warning'
              ),
              opacity: 0.85
            }
          }))
        },
        // It: pulsing, on top.
        {
          type: 'effectScatter',
          coordinateSystem: 'geo',
          zlevel: 2,
          symbolSize: 12,
          rippleEffect: { scale: 3, brushType: 'stroke' },
          itemStyle: { color: getThemeColor('primary') },
          tooltip: { formatter: () => nameOf(self) },
          data: me ? [me] : []
        }
      ]
    };
  }, [
    geo,
    self,
    mode,
    handoffs,
    leaders,
    nameOf,
    getThemeColor,
    isDark,
    width,
    height
  ]);

  return (
    <div ref={boxRef} style={{ height }}>
      {ready && width != null && (
        <ReactEChartsCore
          echarts={echarts}
          option={option}
          notMerge
          style={{ height, width: '100%' }}
        />
      )}
    </div>
  );
};

export default NetworkMap;
