import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { EffectScatterChart, LinesChart, ScatterChart } from 'echarts/charts';
import { GeoComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import {
  DIVERGENCE,
  DivergentVote,
  HostMove,
  REGION_NAME,
  delayTone,
  signedMs,
  Region,
  regionCenter,
  regionOf
} from 'helpers/network';
import {
  countryRegions,
  coord,
  loadWorld,
  regionOutlines
} from 'helpers/worldMap';
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

export type MapMode = 'handoffs' | 'divergent' | 'hosts';

export type RegionHandoff = {
  region: Region;
  count: number;
  p50Ms: number | null;
  expectedP50Ms: number | null;
  /** Its extra delay: over the network floor, less one slot. */
  excessP50Ms: number | null;
  /** The cluster's over-the-floor for handoffs from the same region. */
  clusterExcessP50Ms: number | null;
  /** A slot that epoch (the cluster's pace within windows). */
  slotMs: number | null;
};

const ms = (v: number | null | undefined) =>
  v == null ? '—' : `${Math.round(v).toLocaleString('en-US')} ms`;
const pct = (x: number) =>
  `${(x * 100).toLocaleString('en-US', { maximumFractionDigits: x < 0.01 ? 2 : 1 })}%`;

/** Degrees of the grid the hovered region's validators are grouped on. */
const GRID = 3;

/** How far the map zooms in. */
const MAX_ZOOM = 8;

/**
 * Where a validator sits in the network, for one epoch - kept sparse: it,
 * pulsing, and either its handoffs (each region its previous leaders were
 * in drawn as one shape with a small label - region, time over the
 * network floor - and a line to it as thick as how many; hovered, its
 * validators show as dots grouped by place, its figures in a corner, and
 * the region, line and label take its tone against the cluster's from
 * the same region) or a page of its divergent votes, each a line from
 * that slot's leader to it in the vote's tone (the highlighted one bold).
 */
const NetworkMap = ({
  geo,
  self,
  mode,
  handoffs,
  votes,
  highlight,
  onHighlight,
  moves = [],
  nameOf
}: {
  geo: Map<string, ValidatorGeo>;
  /** Its node address. */
  self: string;
  mode: MapMode;
  handoffs: RegionHandoff[];
  /** Divergent votes to draw (a page of them). */
  votes: DivergentVote[];
  /** The slot highlighted (its list row hovered), and to set it. */
  highlight: number | null;
  onHighlight: (slot: number | null) => void;
  /** Its host moves (the Hosts view), newest first. */
  moves?: HostMove[];
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
  // The region under the pointer (its shape, label or line): expanded and
  // colored.
  const [hover, setHover] = useState<Region | null>(null);
  // Zoom and pan (scroll / pinch / drag, or the buttons): kept here so a
  // hover's redraw doesn't reset them.
  // Not state: a drag reports every step, and re-rendering mid-drag would
  // reset the chart under the pointer. The buttons bump `viewTick` to
  // redraw; scroll / drag only update the ref, read on the next redraw.
  const chartRef = useRef<ReactEChartsCore>(null);
  const viewRef = useRef<{ zoom: number; center?: [number, number] }>({
    zoom: 1
  });
  const [viewTick, setViewTick] = useState(0);
  const zoomBy = (f: number) => {
    const v = viewRef.current;
    viewRef.current = {
      ...v,
      zoom: Math.min(MAX_ZOOM, Math.max(1, v.zoom * f))
    };
    setViewTick(t => t + 1);
  };
  const resetView = () => {
    viewRef.current = { zoom: 1 };
    setViewTick(t => t + 1);
  };
  const view = viewRef.current;

  const option = useMemo(() => {
    const me = coord(geo.get(self));
    const tone = (excess: number | null, cluster: number | null) =>
      getThemeColor(delayTone(excess, cluster));
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
    // Divergent votes (the page shown): a line from each slot's leader
    // to it, in the vote's tone; the highlighted one bold, the rest faint.
    const paths =
      mode === 'divergent' && me
        ? votes
            .map(v => ({ v, from: v.leader ? coord(geo.get(v.leader)) : null }))
            .filter(
              (x): x is { v: DivergentVote; from: [number, number] } => !!x.from
            )
        : [];
    // Hosts: each place it ran from, and an arrow per move between two
    // (a move within one place can't be drawn: it's in the list).
    const arrows =
      mode === 'hosts'
        ? moves.filter(
            (
              m
            ): m is HostMove & {
              from: [number, number];
              to: [number, number];
            } =>
              !!m.from &&
              !!m.to &&
              (m.from[0] !== m.to[0] || m.from[1] !== m.to[1])
          )
        : [];
    const places =
      mode === 'hosts'
        ? [
            ...new Map(
              moves
                .flatMap(m =>
                  [
                    [m.from, m.fromLabel],
                    [m.to, m.toLabel]
                  ].filter((x): x is [[number, number], string] => !!x[0])
                )
                .map(([c, label]) => [`${c[0]},${c[1]}`, { c, label }])
            ).values()
          ]
        : [];
    // Handoffs: each region with any drawn as one shape (its countries a
    // tint, no borders between them); hovered, in its tone.
    const shown = new Map(lines.map(x => [x.h.region, x.h]));
    const regions =
      mode === 'handoffs'
        ? [...countryRegions]
            .filter(([, r]) => shown.has(r))
            .map(([name, r]) => {
              const h = shown.get(r)!;
              if (hover !== r) return null;
              const fill = echarts.color.modifyAlpha(
                tone(h.excessP50Ms, h.clusterExcessP50Ms),
                0.3
              );
              return { name, itemStyle: { areaColor: fill } };
            })
            .filter(Boolean)
        : [];
    // The outline of each region with handoffs; hovered, in its tone.
    const outlines =
      mode === 'handoffs'
        ? [...shown].flatMap(([r, h]) =>
            (regionOutlines.get(r) ?? []).map(coords => ({
              coords,
              lineStyle: {
                color:
                  hover === r
                    ? tone(h.excessP50Ms, h.clusterExcessP50Ms)
                    : getThemeColor(isDark ? 'gray-600' : 'gray-400'),
                width: hover === r ? 1.5 : 1,
                opacity: 1
              }
            }))
          )
        : [];
    // The hovered region's validators, grouped by place (a ~3° grid),
    // each group a dot sized by its stake.
    const total = [...geo.values()].reduce((a, v) => a + v.activatedStake, 0);
    const groups =
      mode === 'handoffs' && hover
        ? [
            ...[...geo.values()]
              .filter(v => regionOf(v) === hover && coord(v))
              .reduce((m, v) => {
                const [lon, lat] = coord(v)!;
                const k = `${Math.round(lon / GRID)}:${Math.round(lat / GRID)}`;
                const g = m.get(k) ?? {
                  lon: 0,
                  lat: 0,
                  stake: 0,
                  count: 0,
                  places: new Map<string, number>()
                };
                const w = Math.max(v.activatedStake, 1);
                g.lon += lon * w;
                g.lat += lat * w;
                g.stake += w;
                g.count++;
                const place = v.geo?.city ?? v.geo?.country ?? '';
                g.places.set(place, (g.places.get(place) ?? 0) + 1);
                return m.set(k, g);
              }, new Map<string, { lon: number; lat: number; stake: number; count: number; places: Map<string, number> }>())
              .values()
          ].map(g => ({
            ...g,
            c: [g.lon / g.stake, g.lat / g.stake] as [number, number],
            // The group's largest place names it.
            name: [...g.places].sort((a, b) => b[1] - a[1])[0]?.[0] || ''
          }))
        : [];
    const maxGroup = Math.max(1, ...groups.map(g => g.stake));
    const hovered = hover ? shown.get(hover) : undefined;
    // Its label: small (region, over the floor) until hovered, then the
    // whole story.
    const label = (h: RegionHandoff) =>
      `{b|${REGION_NAME[h.region]}} ${signedMs(h.excessP50Ms)}`;
    return {
      animation: false,
      tooltip: { trigger: 'item', confine: true },
      geo: {
        map: 'world',
        roam: true,
        zoom: view.zoom,
        ...(view.center ? { center: view.center } : {}),
        scaleLimit: { min: 1, max: MAX_ZOOM },
        // Hovering a region's countries opens its label.
        silent: false,
        tooltip: { show: false },
        regions,
        layoutCenter: ['50%', '50%'],
        layoutSize:
          width != null ? Math.min(width - 8, (height - 8) * ASPECT) : '100%',
        itemStyle: {
          areaColor: getThemeColor(isDark ? 'body-highlight-bg' : 'gray-100'),
          // Handoffs: no borders between countries, so the regions'
          // outlines read as the shapes.
          borderColor:
            mode === 'handoffs'
              ? getThemeColor(isDark ? 'body-highlight-bg' : 'gray-100')
              : getThemeColor('border-color'),
          borderWidth: 0.5
        },
        emphasis: { disabled: true }
      },
      series: [
        // The outlines of the regions with handoffs.
        {
          type: 'lines',
          coordinateSystem: 'geo',
          polyline: true,
          silent: true,
          z: 3,
          data: outlines
        },
        {
          type: 'lines',
          coordinateSystem: 'geo',
          zlevel: 1,
          name: 'lines',
          lineStyle: { curveness: 0.25 },
          tooltip: { show: false },
          emphasis: { disabled: true },
          data: lines.map(({ h, from }) => ({
            name: h.region,
            coords: [from, me],
            lineStyle: {
              width: 1.5 + (3 * h.count) / maxCount,
              color:
                hover === h.region
                  ? tone(h.excessP50Ms, h.clusterExcessP50Ms)
                  : getThemeColor(isDark ? 'gray-500' : 'gray-400'),
              opacity: hover && hover !== h.region ? 0.35 : 0.9
            }
          }))
        },
        // The hovered region's validators, grouped.
        {
          type: 'scatter',
          coordinateSystem: 'geo',
          name: 'groups',
          zlevel: 2,
          emphasis: { disabled: true },
          symbolSize: (v: number[]) => 4 + 16 * Math.sqrt(v[2] / maxGroup),
          tooltip: {
            formatter: (p: { dataIndex: number }) => {
              const g = groups[p.dataIndex];
              return g
                ? `<b>${g.name || 'Unknown place'}</b>${g.places.size > 1 ? ` and nearby` : ''}<br/>${g.count.toLocaleString()} validator${g.count === 1 ? '' : 's'} · ${pct(total ? g.stake / total : 0)} of stake`
                : '';
            }
          },
          data: groups.map(g => ({
            name: hover,
            value: [...g.c, g.stake],
            itemStyle: {
              color: hovered
                ? tone(hovered.excessP50Ms, hovered.clusterExcessP50Ms)
                : getThemeColor('secondary'),
              opacity: 0.6,
              borderColor: getThemeColor('body-bg'),
              borderWidth: 1
            }
          }))
        },
        // Each region's label, at the middle of its validators.
        {
          type: 'scatter',
          coordinateSystem: 'geo',
          name: 'labels',
          zlevel: 3,
          symbolSize: 6,
          tooltip: { show: false },
          emphasis: { disabled: true },
          data: lines.map(({ h, from }) => ({
            name: h.region,
            value: from,
            itemStyle: {
              color: tone(h.excessP50Ms, h.clusterExcessP50Ms)
            },
            label: {
              show: true,
              position: 'top',
              distance: 6,
              formatter: label(h),
              fontSize: 10,
              lineHeight: 14,
              color: getThemeColor('body-color'),
              backgroundColor: getThemeColor('body-bg'),
              borderColor:
                hover === h.region
                  ? tone(h.excessP50Ms, h.clusterExcessP50Ms)
                  : getThemeColor('border-color'),
              borderWidth: 1,
              borderRadius: 4,
              padding: [2, 5],
              rich: { b: { fontWeight: 'bold', fontSize: 10 } }
            },
            z: hover === h.region ? 10 : 1
          }))
        },
        {
          type: 'lines',
          coordinateSystem: 'geo',
          zlevel: 1,
          name: 'paths',
          lineStyle: { curveness: 0.2 },
          emphasis: { disabled: true },
          tooltip: { show: false },
          data: paths.map(({ v, from }) => ({
            name: String(v.slot),
            coords: [from, me],
            lineStyle: {
              color: getThemeColor(DIVERGENCE[v.kind].tone),
              width: highlight === v.slot ? 3 : 1.5,
              opacity: highlight == null || highlight === v.slot ? 0.9 : 0.2
            }
          }))
        },
        {
          type: 'scatter',
          coordinateSystem: 'geo',
          zlevel: 1,
          name: 'leaders',
          emphasis: { disabled: true },
          symbolSize: 7,
          tooltip: {
            formatter: (p: { dataIndex: number }) => {
              const x = paths[p.dataIndex];
              return x
                ? `<b>${x.v.leader ? nameOf(x.v.leader) : 'Unknown'}</b><br/>Slot ${x.v.slot.toLocaleString()} · ${DIVERGENCE[x.v.kind].label}`
                : '';
            }
          },
          data: paths.map(({ v, from }) => ({
            name: String(v.slot),
            value: from,
            itemStyle: {
              color: getThemeColor(DIVERGENCE[v.kind].tone),
              opacity: highlight == null || highlight === v.slot ? 1 : 0.3
            }
          }))
        },
        {
          type: 'lines',
          coordinateSystem: 'geo',
          zlevel: 1,
          name: 'moves',
          lineStyle: { curveness: 0.25 },
          symbol: ['none', 'arrow'],
          symbolSize: 8,
          emphasis: { disabled: true },
          tooltip: {
            formatter: (p: { dataIndex: number }) => {
              const m = arrows[p.dataIndex];
              return m
                ? `<b>${m.kind === 'failover' ? 'Failover' : 'Moved'}</b> · epoch ${m.epoch}${m.slot != null ? `, slot ${m.slot.toLocaleString()}` : ''}<br/>${m.fromLabel} → ${m.toLabel}`
                : '';
            }
          },
          data: arrows.map(m => ({
            coords: [m.from, m.to],
            lineStyle: {
              color: getThemeColor(
                m.kind === 'failover' ? 'warning' : 'primary'
              ),
              width: 2,
              opacity: 0.85
            }
          }))
        },
        {
          type: 'scatter',
          coordinateSystem: 'geo',
          zlevel: 1,
          name: 'places',
          symbolSize: 7,
          emphasis: { disabled: true },
          tooltip: {
            formatter: (p: { dataIndex: number }) =>
              places[p.dataIndex]?.label ?? ''
          },
          data: places.map((x, i) => ({
            value: x.c,
            itemStyle: { color: getThemeColor('secondary') },
            label: {
              show: true,
              // Alternate sides, so two places close together (a
              // failover pair) don't stack their labels.
              position: i % 2 ? 'left' : 'right',
              formatter: x.label.split(' · ')[0],
              fontSize: 10,
              color: getThemeColor('body-color'),
              backgroundColor: getThemeColor('body-bg'),
              borderColor: getThemeColor('border-color'),
              borderWidth: 1,
              borderRadius: 4,
              padding: [2, 5]
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
    ready,
    viewTick,
    geo,
    self,
    mode,
    hover,
    handoffs,
    votes,
    highlight,
    moves,
    nameOf,
    getThemeColor,
    isDark,
    width,
    height
  ]);

  // The hovered region's whole story, in a corner (on the map it would
  // cover the region's own dots).
  const open =
    mode === 'handoffs' && hover
      ? handoffs.find(h => h.region === hover)
      : undefined;
  return (
    <div ref={boxRef} className="position-relative" style={{ height }}>
      {ready && (
        <div
          className="position-absolute top-0 end-0 m-2 btn-group-vertical btn-group-sm"
          style={{ zIndex: 2 }}
        >
          <button
            type="button"
            className="btn btn-soft-secondary px-2 py-0"
            aria-label="Zoom in"
            onClick={() => zoomBy(1.5)}
          >
            +
          </button>
          <button
            type="button"
            className="btn btn-soft-secondary px-2 py-0"
            aria-label="Zoom out"
            onClick={() => zoomBy(1 / 1.5)}
          >
            −
          </button>
          {(view.zoom > 1 || view.center) && (
            <button
              type="button"
              className="btn btn-soft-secondary px-2 py-0 fs-10"
              aria-label="Reset the map"
              title="Back to the whole world"
              onClick={resetView}
            >
              ⟲
            </button>
          )}
        </div>
      )}
      {open && (
        <div
          className="position-absolute bottom-0 start-0 m-2 px-2 py-1 rounded border bg-body fs-10 lh-sm"
          style={{ zIndex: 2, pointerEvents: 'none' }}
        >
          <div className="fw-bold">
            From {REGION_NAME[open.region]} · {open.count.toLocaleString()}{' '}
            handoffs
          </div>
          <div>
            Median {ms(open.p50Ms)}: a slot {ms(open.slotMs)}, network floor{' '}
            {ms(open.expectedP50Ms)}, <b>{signedMs(open.excessP50Ms)}</b> extra
          </div>
          <div className="text-body-tertiary">
            Cluster from {REGION_NAME[open.region]}:{' '}
            {signedMs(open.clusterExcessP50Ms)} extra
          </div>
        </div>
      )}
      {ready && width != null && (
        <ReactEChartsCore
          ref={chartRef}
          echarts={echarts}
          option={option}
          notMerge
          style={{ height, width: '100%' }}
          onEvents={{
            // A region's shape, label or line under the pointer.
            mouseover: (p: {
              componentType?: string;
              name?: string;
              data?: { name?: string };
              event?: { event?: { buttons?: number } };
            }) => {
              // Mid-drag: a redraw would stop the pan.
              if (p.event?.event?.buttons) return;
              if (
                (p as { seriesName?: string }).seriesName === 'paths' ||
                (p as { seriesName?: string }).seriesName === 'leaders'
              ) {
                onHighlight(Number(p.data?.name));
                return;
              }
              const r =
                p.componentType === 'geo'
                  ? countryRegions.get(p.name ?? '')
                  : (p.data?.name as Region | undefined);
              if (r && handoffs.some(h => h.region === r)) setHover(r);
            },
            globalout: () => {
              setHover(null);
              onHighlight(null);
            },
            // Scroll, pinch or drag: keep where it is.
            georoam: () => {
              const g = (
                chartRef.current?.getEchartsInstance().getOption() as {
                  geo?: Array<{ zoom?: number; center?: [number, number] }>;
                }
              )?.geo?.[0];
              if (g)
                viewRef.current = {
                  zoom: g.zoom ?? 1,
                  center: g.center ?? undefined
                };
            }
          }}
        />
      )}
    </div>
  );
};

export default NetworkMap;
