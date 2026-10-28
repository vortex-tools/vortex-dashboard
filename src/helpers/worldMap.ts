import * as echarts from 'echarts/core';
import { ValidatorGeo } from 'providers/vortex-schemas';

// The world outline (Natural Earth 110m via world-atlas), loaded on first
// use so only this page pays for it.
let worldReady: Promise<void> | null = null;
export const loadWorld = () =>
  (worldReady ??= Promise.all([
    import('world-atlas/countries-110m.json'),
    import('topojson-client')
  ])
    .then(async ([topo, topojson]) => {
      // A chunk gone after a deploy: main.tsx's vite:preloadError handler
      // is reloading the page and the imports resolve to nothing - wait
      // for the reload rather than fail on them.
      if (!topo || !topojson) return new Promise<never>(() => {});
      const { feature } = topojson;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = (topo as any).default ?? topo;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const geojson = feature(t, t.objects.countries) as any;
      // Shapes crossing the antimeridian (Russia's far east, Fiji) come as
      // rings spanning ~360 degrees and draw as bands across the map: move
      // their western-hemisphere points east of 180 instead.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fixRing = (ring: number[][]) => {
        const lons = ring.map(p => p[0]);
        return Math.max(...lons) - Math.min(...lons) > 180
          ? ring.map(([x, y]) => [x < 0 ? x + 360 : x, y])
          : ring;
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const f of geojson.features as any[]) {
        const g = f.geometry;
        if (g?.type === 'Polygon') g.coordinates = g.coordinates.map(fixRing);
        else if (g?.type === 'MultiPolygon')
          g.coordinates = g.coordinates.map((poly: number[][][]) =>
            poly.map(fixRing)
          );
      }
      // No validators in Antarctica: drop it so the map spends its height on
      // where they are.
      geojson.features = geojson.features.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (f: any) => f.properties?.name !== 'Antarctica'
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      echarts.registerMap('world', geojson as any);
    })
    .catch(e => {
      // Let a later call retry (e.g. after a deploy replaced the chunk).
      worldReady = null;
      throw e;
    }));

export const coord = (g: ValidatorGeo | undefined): [number, number] | null =>
  g?.geo?.longitude != null && g.geo.latitude != null
    ? [g.geo.longitude, g.geo.latitude]
    : null;

/** Great-circle distance (km) between two [lon, lat] points. */
export const distanceKm = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r;
  const dLon = (b[0] - a[0]) * r;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

/** The least one-way time (ms) light in fibre needs for a distance
 *  (~200 km per ms): a floor from geography, not a measurement. */
export const fibreMs = (km: number) => km / 200;
