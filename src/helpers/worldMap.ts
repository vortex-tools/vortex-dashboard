import * as echarts from 'echarts/core';
import type { Region } from 'helpers/network';
import { ValidatorGeo } from 'providers/vortex-schemas';

/** Countries whose shape's middle would put them in the wrong group
 *  (France with French Guiana, Russia spanning to the Pacific), set to the
 *  continent IP geolocation gives them. */
const REGION_OF_COUNTRY: Record<string, Region> = {
  France: 'europe',
  Russia: 'europe',
  Turkey: 'asia',
  Cyprus: 'asia',
  'N. Cyprus': 'asia',
  Georgia: 'asia',
  Armenia: 'asia',
  Azerbaijan: 'asia',
  Kazakhstan: 'asia',
  Eritrea: 'other',
  'Papua New Guinea': 'other',
  'Solomon Is.': 'other',
  Greenland: 'northAmerica',
  'Fr. S. Antarctic Lands': 'other'
};

/** A country's region group, from the middle of its outline's box:
 *  the Americas split at 7° N, Europe north of 36° up to 45° E, Africa
 *  and Oceania with the rest of the world as 'other', and Asia. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const regionOfShape = (f: any): Region => {
  const name = f.properties?.name as string;
  if (REGION_OF_COUNTRY[name]) return REGION_OF_COUNTRY[name];
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (c: any) => {
    if (typeof c[0] === 'number') {
      x0 = Math.min(x0, c[0]);
      x1 = Math.max(x1, c[0]);
      y0 = Math.min(y0, c[1]);
      y1 = Math.max(y1, c[1]);
    } else c.forEach(walk);
  };
  walk(f.geometry?.coordinates ?? []);
  const lon = (x0 + x1) / 2;
  const lat = (y0 + y1) / 2;
  if (lon < -25) return lat > 7 ? 'northAmerica' : 'other';
  if (lat >= 36 && lon < 45) return 'europe';
  if (lon >= -20 && lon < 52 && lat < 37 && (lon < 35 || lat < 12))
    return 'other';
  if (lon > 110 && lat < -10) return 'other';
  return 'asia';
};

/** The world map's countries by region group (filled by loadWorld). */
export const countryRegions = new Map<string, Region>();
/** Each region group's outline as lines of [lon, lat] (filled by
 *  loadWorld). */
export const regionOutlines = new Map<Region, number[][][]>();

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
      const { feature, mesh } = topojson;
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
      // Each country's region group, for drawing regions as one shape.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const f of geojson.features as any[])
        if (f.properties?.name)
          countryRegions.set(f.properties.name, regionOfShape(f));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      echarts.registerMap('world', geojson as any);
      // Each region's outline: its coast and its borders with other
      // regions (arcs between its countries left out), split where a line
      // crosses the antimeridian.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reg = (g: any) =>
        g?.properties?.name && g.properties.name !== 'Antarctica'
          ? countryRegions.get(g.properties.name)
          : undefined;
      for (const r of ['northAmerica', 'europe', 'asia', 'other'] as Region[]) {
        const m = mesh(
          t,
          t.objects.countries,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (x: any, y: any) =>
            (reg(x) === r || reg(y) === r) && (x === y || reg(x) !== reg(y))
        );
        const lines: number[][][] = [];
        for (const line of m.coordinates as number[][][]) {
          let cur: number[][] = [];
          for (const pt of line) {
            const prev = cur[cur.length - 1];
            if (prev && Math.abs(pt[0] - prev[0]) > 180) {
              if (cur.length > 1) lines.push(cur);
              cur = [];
            }
            cur.push(pt);
          }
          if (cur.length > 1) lines.push(cur);
        }
        regionOutlines.set(r, lines);
      }
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
