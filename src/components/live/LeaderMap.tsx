import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { graphic } from 'echarts/core';
import { EffectScatterChart, ScatterChart } from 'echarts/charts';
import { GeoComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useAppContext } from 'providers/AppProvider';
import { ValidatorGeo } from 'providers/vortex-schemas';
import { useEffect, useMemo, useRef, useState } from 'react';
import { coord, loadWorld } from 'helpers/worldMap';

const FLIGHT_MS = 600;

echarts.use([
  EffectScatterChart,
  ScatterChart,
  GeoComponent,
  TooltipComponent,
  CanvasRenderer
]);

/**
 * Where the leaders are: every validator as a faint dot, the current
 * leader pulsing, the last few leaders fading behind it, and a ball
 * passed from the previous leader to the new one - so leadership hopping around the world is visible as
 * the slots play.
 */
/** The world map's width to height (Antarctica dropped). */
const ASPECT = 1.9;
/** The least height the map takes when filling its parent. */
const MIN_FILL_HEIGHT = 100;

const LeaderMap = ({
  geo,
  leaders,
  nameOf,
  fill = false
}: {
  geo: Map<string, ValidatorGeo> | null;
  /** Take its parent's height (it must give one) rather than one from
   *  its width. */
  fill?: boolean;
  /** Leaders of the latest windows, newest first (current first). */
  leaders: string[];
  nameOf: (node: string | null | undefined) => string;
}) => {
  const { getThemeColor, isDark } = useAppContext();
  const [ready, setReady] = useState(false);
  // Its box: from the width at the world map's aspect (~2:1), up to the
  // desktop height - or, with `fill`, the height its parent gives it (beside
  // Current Leader, which sets the row's height). Either way the map keeps
  // its aspect, centered: a wider box only adds space at the sides.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    read();
    return () => ro.disconnect();
  }, []);
  const width = size?.w ?? null;
  const height = fill
    ? Math.max(MIN_FILL_HEIGHT, size?.h ?? MIN_FILL_HEIGHT)
    : width != null
      ? Math.round(Math.min(260, width * 0.5))
      : 260;
  // The map's own width in the box: as wide as the height allows at its
  // aspect, never wider than the box.
  const mapWidth =
    width != null
      ? Math.max(0, Math.min(width - 8, (height - 8) * ASPECT))
      : null;
  useEffect(() => {
    let alive = true;
    loadWorld().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const all = useMemo(
    () =>
      geo
        ? [...geo.values()]
            .map(v => ({ v, c: coord(v) }))
            .filter(x => x.c)
            .map(({ v, c }) => ({
              name: v.name ?? v.nodeAddress,
              value: [...c!, v.activatedStake]
            }))
        : [],
    [geo]
  );

  // Rebuild the option only when the leaders (by value) or theme change -
  // not on every page tick (the leaders array and nameOf are new objects
  // each render).
  const leadersKey = leaders.join(',');
  const nameRef = useRef(nameOf);
  nameRef.current = nameOf;
  const option = useMemo(() => {
    const nameOf = nameRef.current;
    const leaders = leadersKey ? leadersKey.split(',') : [];
    const primary = getThemeColor('primary');
    const recent = leaders
      .map(l => ({ l, c: coord(geo?.get(l)) }))
      .filter((x): x is { l: string; c: [number, number] } => !!x.c);
    const current = recent[0];
    const trail = recent.slice(1, 8);
    return {
      animation: true,
      tooltip: {
        trigger: 'item',
        formatter: (p: { name: string }) => p.name
      },
      // Static layer (zlevel 0): countries and validator dots, repainted
      // only when they change. Moving parts (pulse, trail, ball) sit on
      // their own canvas (zlevel 1), so animation frames repaint just that.
      geo: {
        zlevel: 0,
        map: 'world',
        roam: false,
        silent: true,
        // Centered at its own aspect (see mapWidth).
        layoutCenter: ['50%', '50%'],
        layoutSize: mapWidth ?? '100%',
        itemStyle: {
          areaColor: getThemeColor(isDark ? 'body-highlight-bg' : 'gray-100'),
          borderColor: getThemeColor('border-color'),
          borderWidth: 0.5
        },
        emphasis: { disabled: true }
      },
      series: [
        {
          name: 'Validators',
          zlevel: 0,
          type: 'scatter',
          coordinateSystem: 'geo',
          silent: true,
          symbolSize: (v: number[]) =>
            Math.max(2, Math.min(7, Math.sqrt(v[2] / 1e9) / 120)),
          itemStyle: { color: getThemeColor('gray-400'), opacity: 0.5 },
          data: all
        },
        {
          name: 'Recent leaders',
          zlevel: 1,
          type: 'scatter',
          coordinateSystem: 'geo',
          symbolSize: 7,
          data: trail.map((t, i) => ({
            name: nameOf(t.l),
            value: t.c,
            itemStyle: { color: primary, opacity: 0.6 - i * 0.07 }
          }))
        },

        {
          name: 'Leader',
          zlevel: 1,
          type: 'effectScatter',
          coordinateSystem: 'geo',
          symbolSize: 12,
          rippleEffect: { scale: 3.5, brushType: 'stroke', period: 1.6 },
          itemStyle: { color: primary },
          data: current ? [{ name: nameOf(current.l), value: current.c }] : []
        }
      ]
    };
  }, [all, leadersKey, geo, getThemeColor, isDark, mapWidth]);

  // One flight per hand-off: when the leader changes (to a different
  // place), move the ball along a gentle curve from the previous leader
  // to the new one, then hide it.
  const chartRef = useRef<ReactEChartsCore>(null);
  const handoff = useMemo(() => {
    const a = leaders[1] ? coord(geo?.get(leaders[1])) : null;
    const b = leaders[0] ? coord(geo?.get(leaders[0])) : null;
    return a && b && (a[0] !== b[0] || a[1] !== b[1])
      ? { key: leaders[0], from: a, to: b }
      : null;
  }, [leaders, geo]);
  useEffect(() => {
    if (!handoff || !ready) return;
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart || chart.isDisposed()) return;
    // A zrender circle on the top layer, animated by zrender itself: no
    // chart update per frame (setOption every frame re-ran the whole
    // chart - geo layout, every dot - and pinned the main thread).
    // Just mounted (arriving with the data cached), the chart has no model
    // yet - its option is applied lazily - and convertToPixel throws:
    // skip this flight rather than take the page down. The next hand-off
    // flies.
    let from: number[] | undefined;
    let to: number[] | undefined;
    try {
      from = chart.convertToPixel({ geoIndex: 0 }, handoff.from);
      to = chart.convertToPixel({ geoIndex: 0 }, handoff.to);
    } catch {
      return;
    }
    if (!from || !to) return;
    const [x0, y0] = from;
    const [x1, y1] = to;
    // Control point: off the midpoint, perpendicular, for a slight arc.
    const mx = (x0 + x1) / 2 + (y1 - y0) * 0.2;
    const my = (y0 + y1) / 2 - (x1 - x0) * 0.2;
    const zr = chart.getZr();
    const ball = new graphic.Circle({
      shape: { cx: x0, cy: y0, r: 3.5 },
      style: { fill: getThemeColor('primary') },
      zlevel: 2,
      silent: true
    });
    // (echarts and zrender ship separate copies of the element types.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    zr.add(ball as any);
    const anim = { stopped: false };
    const start = performance.now();
    const step = () => {
      if (anim.stopped) return;
      const t = Math.min(1, (performance.now() - start) / FLIGHT_MS);
      const e = 1 - (1 - t) ** 2; // ease out
      ball.setShape({
        cx: (1 - e) ** 2 * x0 + 2 * (1 - e) * e * mx + e ** 2 * x1,
        cy: (1 - e) ** 2 * y0 + 2 * (1 - e) * e * my + e ** 2 * y1
      });
      if (t < 1) requestAnimationFrame(step);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      else zr.remove(ball as any);
    };
    requestAnimationFrame(step);
    return () => {
      anim.stopped = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      zr.remove(ball as any);
    };
    // A new hand-off (keyed by the new leader) starts a new flight.
  }, [handoff?.key, ready]);

  return (
    <div ref={boxRef} style={fill ? { height: '100%' } : undefined}>
      {!ready || !geo ? (
        <div
          className="d-flex align-items-center justify-content-center text-body-tertiary fs-9"
          style={{ height }}
        >
          Loading map…
        </div>
      ) : (
        <ReactEChartsCore
          ref={chartRef}
          echarts={echarts}
          option={option}
          lazyUpdate
          style={{ height, width: '100%' }}
        />
      )}
    </div>
  );
};

export default LeaderMap;
