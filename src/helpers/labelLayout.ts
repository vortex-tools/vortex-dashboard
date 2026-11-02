/**
 * Map label placement: each label picks one of eight spots around its
 * point (above, below, beside, the four corners), scored by how much it
 * would overlap the labels already placed, the dots, and the chart's
 * edges, plus how far down its own preference list the spot is. Labels go
 * in priority order (greedy), then a couple of repair passes let each one
 * move again knowing where all the others ended up. Pixels throughout.
 */

export type Spot =
  | 'top'
  | 'bottom'
  | 'right'
  | 'left'
  | 'tr'
  | 'tl'
  | 'br'
  | 'bl';

export type LabelSpec = {
  /** The point it labels, in pixels. */
  at: [number, number];
  w: number;
  h: number;
  /** Space between the point and the label's nearest edge. */
  gap: number;
  /** Its spots, best first; the rest are tried after, costing more. */
  prefs: Spot[];
};

/** A dot to keep labels off (a circle, in pixels). */
export type Dot = { at: [number, number]; r: number };

type Box = { x: number; y: number; w: number; h: number };

const ALL: Spot[] = ['top', 'bottom', 'right', 'left', 'tr', 'tl', 'br', 'bl'];

/** The label's box at a spot. */
const boxAt = (s: LabelSpec, spot: Spot): Box => {
  const [ax, ay] = s.at;
  const { w, h, gap } = s;
  const d = gap * 0.71; // corners: the gap along the diagonal
  switch (spot) {
    case 'top':
      return { x: ax - w / 2, y: ay - gap - h, w, h };
    case 'bottom':
      return { x: ax - w / 2, y: ay + gap, w, h };
    case 'right':
      return { x: ax + gap, y: ay - h / 2, w, h };
    case 'left':
      return { x: ax - gap - w, y: ay - h / 2, w, h };
    case 'tr':
      return { x: ax + d, y: ay - d - h, w, h };
    case 'tl':
      return { x: ax - d - w, y: ay - d - h, w, h };
    case 'br':
      return { x: ax + d, y: ay + d, w, h };
    case 'bl':
      return { x: ax - d - w, y: ay + d, w, h };
  }
};

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

const outside = (b: Box, W: number, H: number, pad = 3) =>
  b.w * b.h -
  overlap(b, {
    x: pad,
    y: pad,
    w: Math.max(0, W - 2 * pad),
    h: Math.max(0, H - 2 * pad)
  });

/** Where each label goes: its box's centre, in the specs' order. */
export const layoutLabels = (
  specs: LabelSpec[],
  dots: Dot[],
  W: number,
  H: number
): Array<{ spot: Spot; center: [number, number] }> => {
  // A little breathing room around every placed label.
  const PAD = 3;
  const grow = (b: Box): Box => ({
    x: b.x - PAD,
    y: b.y - PAD,
    w: b.w + 2 * PAD,
    h: b.h + 2 * PAD
  });
  const dotBox = (d: Dot): Box => ({
    x: d.at[0] - d.r,
    y: d.at[1] - d.r,
    w: 2 * d.r,
    h: 2 * d.r
  });
  const dotBoxes = dots.map(dotBox);
  const chosen: Array<Box | null> = specs.map(() => null);
  const spots: Spot[] = specs.map(s => s.prefs[0] ?? 'top');
  const cost = (i: number, spot: Spot) => {
    const s = specs[i];
    const b = boxAt(s, spot);
    const g = grow(b);
    const rank = s.prefs.indexOf(spot);
    let c = (rank < 0 ? s.prefs.length + 2 : rank) * 40;
    c += outside(b, W, H) * 50;
    chosen.forEach((o, j) => {
      if (o && j !== i) c += overlap(g, o) * 12;
    });
    for (const d of dotBoxes) c += overlap(b, d) * 8;
    return c;
  };
  const place = (i: number) => {
    let best = Infinity;
    for (const spot of [
      ...specs[i].prefs,
      ...ALL.filter(a => !specs[i].prefs.includes(a))
    ]) {
      const c = cost(i, spot);
      if (c < best) {
        best = c;
        spots[i] = spot;
      }
    }
    chosen[i] = boxAt(specs[i], spots[i]);
  };
  specs.forEach((_, i) => place(i));
  for (let pass = 0; pass < 2; pass++) specs.forEach((_, i) => place(i));
  return specs.map((s, i) => {
    const b = boxAt(s, spots[i]);
    return { spot: spots[i], center: [b.x + b.w / 2, b.y + b.h / 2] };
  });
};
