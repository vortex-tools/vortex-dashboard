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
