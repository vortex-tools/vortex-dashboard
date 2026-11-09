import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { ScatterChart } from 'echarts/charts';
import { GeoComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import ChartSkeleton from 'components/common/ChartSkeleton';
import { loadWorld } from 'helpers/worldMap';
import { useAppContext } from 'providers/AppProvider';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';

echarts.use([ScatterChart, GeoComponent, TooltipComponent, CanvasRenderer]);

/** The world map's width to height (Antarctica dropped). */
const ASPECT = 1.9;
/** The most it zooms in (scroll, pinch or +). */
const MAX_ZOOM = 20;
/** The map's height at most (desktop). */
const MAX_HEIGHT = 380;

export type MapPoint = {
  /** Lon, lat. */
  coord: [number, number];
  stake: number;
  color: string;
  /** The tooltip's HTML. */
  tooltip: string;
};

/** Dot size by stake: area follows stake, between 4 and 30 px. */
const sizeOf = (stake: number, max: number) =>
  max > 0 ? Math.max(4, Math.sqrt(stake / max) * 30) : 4;

/**
 * A world map of places (a hosting provider's locations, or every
 * provider's), each a dot sized by its stake in its color. Larger dots
 * are drawn first so small ones stay on top.
 */
const ProviderMap = ({
  points,
  onClick,
  legend
}: {
  points: MapPoint[];
  /** A dot clicked: its index in `points`. */
  onClick?: (index: number) => void;
  /** Drawn over the map's bottom left corner. */
  legend?: ReactNode;
}) => {
  const { getThemeColor, isDark } = useAppContext();
  const [ready, setReady] = useState(false);
  // Bumped by Reset: a new chart at the whole world.
  const [view, setView] = useState(0);
  const [moved, setMoved] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReactEChartsCore>(null);
  // Zoom by a factor about a point of the box (default its middle: the
  // +/- buttons), keeping that point where it is, within 1-MAX_ZOOM.
  const zoomBy = (f: number, at?: [number, number]) => {
    const chart = chartRef.current?.getEchartsInstance();
    const el = boxRef.current;
    if (!chart || chart.isDisposed() || !el) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geo = (chart.getOption() as any).geo?.[0];
    const old = geo?.zoom ?? 1;
    const zoom = Math.min(MAX_ZOOM, Math.max(1, old * f));
    if (zoom === old) return;
    const mid: [number, number] = [el.clientWidth / 2, el.clientHeight / 2];
    const a = chart.convertFromPixel({ geoIndex: 0 }, at ?? mid) as
      | number[]
      | undefined;
    const m = chart.convertFromPixel({ geoIndex: 0 }, mid) as
      | number[]
      | undefined;
    const k = old / zoom;
    chart.setOption({
      geo: {
        zoom,
        ...(zoom === 1
          ? { center: null }
          : a && m
            ? { center: [a[0] + (m[0] - a[0]) * k, a[1] + (m[1] - a[1]) * k] }
            : {})
      }
    });
    setZoomed(zoom > 1);
    setMoved(zoom !== 1 || !!geo?.center);
  };
  const [zoomed, setZoomed] = useState(false);
  // A mouse or trackpad zooms with Ctrl / Cmd + scroll (a trackpad pinch
  // sends that too); a plain scroll scrolls the page, with a hint. Touch:
  // pinch is the page's, the +/- buttons zoom, and a zoomed map drags.
  const coarse = useMemo(
    () =>
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(pointer: coarse)').matches,
    []
  );
  const isMac = useMemo(
    () =>
      typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    []
  );
  const [hint, setHint] = useState(false);
  const zoomRef = useRef(zoomBy);
  zoomRef.current = zoomBy;
  useEffect(() => {
    const el = boxRef.current;
    if (!el || coarse) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) {
        setHint(true);
        clearTimeout(timer);
        timer = setTimeout(() => setHint(false), 1400);
        return;
      }
      e.preventDefault();
      const box = el.getBoundingClientRect();
      zoomRef.current(Math.exp(-e.deltaY * 0.0025), [
        e.clientX - box.left,
        e.clientY - box.top
      ]);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      clearTimeout(timer);
    };
  }, [coarse, ready]);
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
  useEffect(() => {
    let alive = true;
    loadWorld().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  const height =
    width != null ? Math.round(Math.min(MAX_HEIGHT, width / ASPECT)) : 260;

  const order = useMemo(
    () =>
      points.map((p, i) => ({ p, i })).sort((a, b) => b.p.stake - a.p.stake),
    [points]
  );
  const max = order[0]?.p.stake ?? 0;
  const option = {
    animation: false,
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: getThemeColor('body-highlight-bg'),
      borderColor: getThemeColor('border-color'),
      textStyle: { color: getThemeColor('body-color'), fontSize: 12 },
      formatter: (x: { dataIndex: number }) =>
        order[x.dataIndex]?.p.tooltip ?? ''
    },
    geo: {
      map: 'world',
      // Drag pans (on touch, once zoomed in); zoom is ours (Ctrl / Cmd +
      // scroll, the buttons). Kept across point changes, reset by Reset.
      roam: coarse ? (zoomed ? 'move' : false) : 'move',
      scaleLimit: { min: 1, max: MAX_ZOOM },
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
        type: 'scatter',
        coordinateSystem: 'geo',
        cursor: onClick ? 'pointer' : 'default',
        data: order.map(({ p }) => ({
          value: p.coord,
          symbolSize: sizeOf(p.stake, max),
          itemStyle: {
            color: p.color,
            opacity: 0.75,
            borderColor: getThemeColor('body-bg'),
            borderWidth: 0.5
          }
        })),
        emphasis: { scale: 1.2, itemStyle: { opacity: 1 } }
      }
    ]
  };
  return (
    <>
      <div ref={boxRef} className="position-relative" style={{ height }}>
        {ready ? (
          <ReactEChartsCore
            key={view}
            ref={chartRef}
            echarts={echarts}
            option={option}
            // Merged, so a zoom or pan survives new points (a legend pick).
            notMerge={false}
            style={{ height, width: '100%' }}
            onEvents={{
              georoam: () => setMoved(true),
              ...(onClick
                ? {
                    click: (e: { dataIndex: number }) => {
                      const hit = order[e.dataIndex];
                      if (hit) onClick(hit.i);
                    }
                  }
                : {})
            }}
          />
        ) : (
          <ChartSkeleton height={height} />
        )}
        {ready && (
          <div className="position-absolute top-0 end-0 d-flex flex-column gap-1">
            <div className="btn-group-vertical btn-group-sm shadow-sm">
              <button
                type="button"
                className="btn btn-soft-secondary px-2 lh-1 fs-8"
                aria-label="Zoom in"
                title="Zoom in"
                onClick={() => zoomBy(1.6)}
              >
                +
              </button>
              <button
                type="button"
                className="btn btn-soft-secondary px-2 lh-1 fs-8"
                aria-label="Zoom out"
                title="Zoom out"
                onClick={() => zoomBy(1 / 1.6)}
              >
                −
              </button>
            </div>
            {moved && (
              <button
                type="button"
                className="btn btn-sm btn-soft-secondary px-2 fs-10 shadow-sm"
                title="Back to the whole world"
                onClick={() => {
                  setView(v => v + 1);
                  setMoved(false);
                  setZoomed(false);
                }}
              >
                Reset
              </button>
            )}
          </div>
        )}
        {hint && (
          <div className="position-absolute top-50 start-50 translate-middle bg-body-emphasis border border-translucent rounded shadow-sm px-3 py-2 fs-9 pe-none">
            Hold {isMac ? '⌘' : 'Ctrl'} and scroll to zoom
          </div>
        )}
        {legend && (
          // A box over the bottom left corner; under the map on phones,
          // where it would cover the dots.
          <div className="d-none d-md-block position-absolute bottom-0 start-0 m-2 bg-body-emphasis border border-translucent rounded shadow-sm px-2 py-1">
            {legend}
          </div>
        )}
      </div>
      {legend && (
        <div className="d-md-none mt-2 bg-body-emphasis border border-translucent rounded px-2 py-1">
          {legend}
        </div>
      )}
    </>
  );
};

export default ProviderMap;
