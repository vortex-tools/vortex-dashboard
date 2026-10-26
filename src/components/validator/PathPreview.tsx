import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LinesChart, ScatterChart } from 'echarts/charts';
import { GeoComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { coord, distanceKm, fibreMs, loadWorld } from 'helpers/worldMap';
import { useAppContext } from 'providers/AppProvider';
import { ValidatorGeo } from 'providers/vortex-schemas';
import { useEffect, useState } from 'react';

echarts.use([ScatterChart, LinesChart, GeoComponent, CanvasRenderer]);

/** The slot a divergent-vote row is about: its two producers. */
export type HoverPath = {
  slot: number;
  block: string | null;
  payer: string | null;
};

/**
 * A small floating map while a divergent-vote row is hovered (the main
 * map is usually scrolled away by then): the slot's block producer ->
 * this validator -> payer, each leg's distance and fibre-time floor.
 */
export const PathPreview = ({
  hover,
  geo,
  voterNode,
  nameOf
}: {
  hover: HoverPath | null;
  geo: Map<string, ValidatorGeo> | null;
  voterNode: string | null;
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
  const voterAt = voterNode ? coord(geo?.get(voterNode)) : null;
  const b = hover?.block ? coord(geo?.get(hover.block)) : null;
  const p = hover?.payer ? coord(geo?.get(hover.payer)) : null;
  const legs: Array<{ who: string; km: number }> = [];
  if (voterAt && b && hover?.block)
    legs.push({
      who: `Block by ${nameOf(hover.block)}`,
      km: distanceKm(b, voterAt)
    });
  if (voterAt && p && hover?.payer)
    legs.push({
      who: `Reward leader ${nameOf(hover.payer)}`,
      km: distanceKm(voterAt, p)
    });
  if (!hover || !ready || !voterAt || (!b && !p)) return null;
  const pts = [
    ...(b ? [{ name: 'Block producer', value: b, c: 'warning' }] : []),
    { name: 'This validator', value: voterAt, c: 'primary' },
    ...(p ? [{ name: 'Reward leader', value: p, c: 'info' }] : [])
  ];
  const option = {
    animation: false,
    geo: {
      map: 'world',
      roam: false,
      silent: true,
      top: 2,
      bottom: 2,
      left: 2,
      right: 2,
      itemStyle: {
        areaColor: getThemeColor(isDark ? 'body-highlight-bg' : 'gray-100'),
        borderColor: getThemeColor('border-color'),
        borderWidth: 0.4
      }
    },
    series: [
      {
        type: 'lines',
        coordinateSystem: 'geo',
        silent: true,
        lineStyle: {
          color: getThemeColor('primary'),
          width: 2,
          curveness: 0.25
        },
        data: [
          ...(b ? [{ coords: [b, voterAt] }] : []),
          ...(p ? [{ coords: [voterAt, p] }] : [])
        ]
      },
      {
        type: 'scatter',
        coordinateSystem: 'geo',
        silent: true,
        symbolSize: 9,
        data: pts.map(x => ({
          name: x.name,
          value: x.value,
          symbol: x.c === 'primary' ? 'diamond' : 'circle',
          itemStyle: { color: getThemeColor(x.c) }
        }))
      }
    ]
  };
  return (
    <div
      className="position-fixed bg-body-emphasis rounded border border-translucent shadow p-2 d-none d-md-block"
      style={{ right: 16, bottom: 16, width: 320, zIndex: 1030 }}
      aria-hidden
    >
      <div className="fs-10 fw-semibold text-body-emphasis mb-1">
        Slot {hover.slot.toLocaleString()}
      </div>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        notMerge
        style={{ height: 150, width: '100%' }}
      />
      <div className="d-flex flex-column gap-1 fs-10 mt-1">
        {legs.map(l => (
          <div key={l.who} className="d-flex justify-content-between gap-2">
            <span className="text-truncate">{l.who}</span>
            <span className="font-monospace text-body-tertiary text-nowrap">
              {Math.round(l.km).toLocaleString()} km · ≥
              {Math.round(fibreMs(l.km))} ms
            </span>
          </div>
        ))}
        <div className="text-body-quaternary">
          distance and the least time light in fibre needs - not measured
        </div>
      </div>
    </div>
  );
};
