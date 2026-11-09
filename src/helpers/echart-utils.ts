import type { CallbackDataParams } from 'echarts/types/dist/shared';

/** An axis tooltip's body: one line per series - color dot, name, its
 *  value through `format`. */
export const namedTooltipList = (
  params: CallbackDataParams[],
  format: (value: unknown) => string
) =>
  `<div class="ms-1">${params
    .map(
      (p, i) =>
        `<div class="fs-9 fw-bold text-body-tertiary${i ? ' mt-1' : ''}">` +
        `<span class="d-inline-block rounded-circle me-2" style="width:.5rem;height:.5rem;background:${String(p.color)}"></span>` +
        `${p.seriesName}: ${format(p.value)}</div>`
    )
    .join('')}</div>`;

/** An option whose series show the default cursor, not ECharts' pointer,
 *  for a chart nothing happens on a click of (series that set a cursor
 *  keep it). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const noPointer = <T extends Record<string, any>>(option: T): T => {
  const series = option.series;
  if (!series) return option;
  // A filled line's area and a bar's label keep ECharts' pointer whatever
  // the cursor: with an axis tooltip (it needs no hover on the series) the
  // series can be silent.
  const axisTip = option.tooltip?.trigger === 'axis';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fix = (s: any) => {
    if (!s || typeof s !== 'object') return s;
    const out = 'cursor' in s ? s : { ...s, cursor: 'default' };
    return axisTip && !('silent' in s) ? { ...out, silent: true } : out;
  };
  return {
    ...option,
    series: Array.isArray(series) ? series.map(fix) : fix(series)
  };
};
