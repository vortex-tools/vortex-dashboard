#!/usr/bin/env node
// Builds the color map the staging build uses to recolor itself pink when
// the testnet API is selected (see vite.config.ts, testnetPalette plugin).
//
// The map is "every color that exists only in the staging build" (i.e.
// produced by the staging accent palette, including Bootstrap's derived
// shades), each hue-shifted to pink with lightness/saturation kept. Diffing
// against the production build keeps unrelated oranges (warning, danger)
// out of it. Re-run after changing the staging palette:
//   npm run build && cp build/assets/*.css /tmp/prod.css
//   npx vite build --mode staging && cp build/assets/*.css /tmp/stg.css
//   node scripts/gen-testnet-palette.mjs /tmp/prod.css /tmp/stg.css
import { readFileSync, writeFileSync } from 'node:fs';

const [prodPath, stgPath] = process.argv.slice(2);
const PINK_HUE = 330;

const rgbToHsl = (r, g, b) => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? (g - b) / d + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return [h * 60, s, l];
};
const hslToRgb = (h, s, l) => {
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map(x => Math.round(x * 255));
};
const orangeish = (r, g, b) => {
  const [h, s] = rgbToHsl(r, g, b);
  return h >= 5 && h <= 45 && s > 0.15;
};
const toPink = (r, g, b) => {
  const [, s, l] = rgbToHsl(r, g, b);
  return hslToRgb(PINK_HUE, s, l);
};

// Normalized color tokens: hex as '#rrggbb', rgb triples as 'r,g,b'
// (numbers as written, floats included).
const collect = css => {
  const out = new Set();
  for (const m of css.matchAll(/#([0-9a-fA-F]{6})\b/g))
    out.add('#' + m[1].toLowerCase());
  for (const m of css.matchAll(
    /(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/g
  ))
    out.add(`${m[1]},${m[2]},${m[3]}`);
  return out;
};
const parse = t =>
  t.startsWith('#')
    ? [1, 3, 5].map(i => parseInt(t.slice(i, i + 2), 16))
    : t.split(',').map(Number);

const prod = collect(readFileSync(prodPath, 'utf8'));
const stg = collect(readFileSync(stgPath, 'utf8'));
const map = {};
for (const t of stg) {
  if (prod.has(t)) continue;
  const [r, g, b] = parse(t);
  if ([r, g, b].some(v => v > 255) || !orangeish(r, g, b)) continue;
  const [pr, pg, pb] = toPink(r, g, b);
  map[t] = t.startsWith('#')
    ? '#' + [pr, pg, pb].map(v => v.toString(16).padStart(2, '0')).join('')
    : `${pr},${pg},${pb}`;
}
writeFileSync(
  'src/assets/testnet-palette.json',
  JSON.stringify(map, null, 2) + '\n'
);
console.log(`${Object.keys(map).length} colors mapped`);
