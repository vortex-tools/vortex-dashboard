/**
 * Which page buttons a pager shows (0-based): up to `size` pages centered
 * on `page`, plus the first and last pages with a gap marker between when
 * they fall outside that run. `null` stands for a gap.
 */
export const pageWindow = (
  page: number,
  pages: number,
  size = 5
): Array<number | null> => {
  if (pages <= 0) return [];
  if (pages <= size + 2) return Array.from({ length: pages }, (_, i) => i);
  const half = Math.floor(size / 2);
  const from = Math.min(Math.max(0, page - half), pages - size);
  const run = Array.from({ length: size }, (_, i) => from + i);
  const out: Array<number | null> = [];
  if (run[0] > 0) out.push(0, ...(run[0] > 1 ? [null] : []));
  out.push(...run);
  const end = run[run.length - 1];
  if (end < pages - 1) out.push(...(end < pages - 2 ? [null] : []), pages - 1);
  return out;
};
