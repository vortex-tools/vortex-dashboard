import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { ScatterChart } from 'echarts/charts';
import { GeoComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import ChartSkeleton from 'components/common/ChartSkeleton';
import { loadWorld } from 'helpers/worldMap';
import { useAppContext } from 'providers/AppProvider';
import { useEffect, useMemo, useRef, useState } from 'react';

echarts.use([ScatterChart, GeoComponent, TooltipComponent, CanvasRenderer]);

/** The world map's width to height (Antarctica dropped). */
const ASPECT = 1.9;
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
  onClick
}: {
  points: MapPoint[];
  /** A dot clicked: its index in `points`. */
  onClick?: (index: number) => void;
}) => {
  const { getThemeColor, isDark } = useAppContext();
  const [ready, setReady] = useState(false);
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
    <div ref={boxRef} style={{ height }}>
      {ready ? (
        <ReactEChartsCore
          echarts={echarts}
          option={option}
          notMerge
          style={{ height, width: '100%' }}
          onEvents={
            onClick
              ? {
                  click: (e: { dataIndex: number }) => {
                    const hit = order[e.dataIndex];
                    if (hit) onClick(hit.i);
                  }
                }
              : undefined
          }
        />
      ) : (
        <ChartSkeleton height={height} />
      )}
    </div>
  );
};

export default ProviderMap;
