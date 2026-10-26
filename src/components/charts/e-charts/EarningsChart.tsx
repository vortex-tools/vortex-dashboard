import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useAppContext } from 'providers/AppProvider';
import { EpochEarnings } from 'providers/VortexDataProvider';
import { useMemo } from 'react';

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer
]);

const SOL = 1e9;
const toSol = (lamports: number | null | undefined) =>
  lamports == null ? null : lamports / SOL;

interface SeriesDef {
  name: string;
  color: string;
  stack: 'income' | 'costs';
  value: (r: EpochEarnings) => number | null;
}

/** Its SFDP vote-cost reimbursement for the epoch it covers (lamports),
 *  or null (not a participant / not paid yet). */
export const sfdpOf = (r: EpochEarnings) =>
  r.income.sfdpReimbursement ?? r.income.voteCostReimbursement ?? null;

/**
 * Its inflation commission for an epoch: the vote account's payout when
 * paid; under Alpenglow before that, an estimate from the gross its votes
 * earned plus its producer bonus x the commission rate (the same split
 * the runtime makes). votes / bonus: the gross it's a share of.
 */
export const commissionOf = (r: EpochEarnings) => {
  const v = r.income.votingReward;
  const b = r.income.producerBonus;
  const bps = r.rates?.inflationRewardsCommissionBps ?? null;
  const gross = v != null && b != null ? { votes: v, bonus: b } : null;
  if (r.income.voteAccountReward != null)
    return { value: r.income.voteAccountReward, estimated: false, ...gross };
  if (r.consensus === 'alpenglow' && gross && bps != null)
    return {
      value: Math.round(((gross.votes + gross.bonus) * bps) / 10_000),
      estimated: true,
      ...gross
    };
  return null;
};

/** Its net for an epoch: the API's, else (Alpenglow, commission not
 *  paid yet) income with the estimated commission, less costs. */
export const netOf = (r: EpochEarnings) => {
  if (r.net != null) return { value: r.net, estimated: false };
  const c = commissionOf(r);
  if (!c?.estimated) return null;
  return {
    value:
      c.value +
      (r.income.blockRevenueCommission ?? 0) +
      (r.income.mevCommission ?? 0) +
      (sfdpOf(r) ?? 0) -
      r.costs.voteFees -
      r.costs.vat,
    estimated: true
  };
};

export type EarningsChartMode = 'net' | 'breakdown';

interface Props {
  rows: EpochEarnings[];
  /** The epoch in progress: drawn faded, no net (rewards not paid yet). */
  currentEpoch: number | null;
  /** net: one bar per epoch (primary if positive, danger if negative);
   *  breakdown: income stacked above zero, costs below. */
  mode: EarningsChartMode;
  /** SOL -> display unit for a row (its epoch's price); null = can't. */
  convert: (row: EpochEarnings, sol: number | null) => number | null;
  /** Formats a display-unit value (compact for axis labels). */
  format: (value: number | null, compact?: boolean) => string;
}

/**
 * Per-epoch earnings: what the validator took from each revenue stream
 * (stacked above zero), what voting cost (below zero), and the net line.
 */
const EarningsChart = ({
  rows,
  currentEpoch,
  mode,
  convert,
  format
}: Props) => {
  const { getThemeColor } = useAppContext();

  const option = useMemo(() => {
    // The theme's primary-light / -lighter are still Bootstrap blue, so
    // build the shades from primary itself (orange on staging, purple in
    // production).
    const primaryRgb = getThemeColor('primary-rgb');
    const primaryShade = (alpha: number) => `rgba(${primaryRgb}, ${alpha})`;
    // The vote account's take of the epoch's inflation - the inflation
    // commission - for every epoch, Tower or Alpenglow. Under Alpenglow
    // it's paid at the next boundary: until then (and for epochs not
    // backfilled), estimate it from the gross the API already has (what
    // its votes earned + its producer bonus) x the commission rate.
    const commission = commissionOf;
    const defs: SeriesDef[] = [
      {
        name: 'Inflation commission',
        color: primaryShade(0.9),
        stack: 'income',
        value: r => convert(r, toSol(commission(r)?.value ?? null))
      },
      {
        name: 'SFDP reimbursement',
        color: getThemeColor('success'),
        stack: 'income',
        value: r => convert(r, toSol(sfdpOf(r)))
      },
      {
        name: 'Block rewards',
        color: primaryShade(0.6),
        stack: 'income',
        value: r => convert(r, toSol(r.income.blockRevenueCommission))
      },
      {
        name: 'MEV',
        color: primaryShade(0.35),
        stack: 'income',
        value: r => convert(r, toSol(r.income.mevCommission))
      },
      {
        name: 'Vote fees',
        color: getThemeColor('gray-300'),
        stack: 'costs',
        value: r => {
          const v = convert(r, toSol(r.costs.voteFees));
          return v ? -v : v;
        }
      },
      {
        name: 'VAT',
        color: getThemeColor('gray-200'),
        stack: 'costs',
        value: r => {
          const v = convert(r, toSol(r.costs.vat));
          return v ? -v : v;
        }
      }
    ];
    const isCurrent = (r: EpochEarnings) => r.epoch === currentEpoch;
    const latestEpoch = Math.max(...rows.map(r => r.epoch));
    // Drop the VAT series entirely while every epoch is pre-Alpenglow, and
    // SFDP's while nothing was reimbursed.
    const sfdp = rows.some(r => sfdpOf(r) != null);
    const shown = defs.filter(
      d =>
        (d.name !== 'VAT' || rows.some(r => r.costs.vat > 0)) &&
        (d.name !== 'SFDP reimbursement' || sfdp)
    );
    // Rewards are shades of primary (strongest = inflation), costs are
    // grays; net bars are primary, or danger when negative.
    const netColor = getThemeColor('primary');
    const lossColor = getThemeColor('danger');

    return {
      animation: false,
      color: mode === 'breakdown' ? shown.map(d => d.color) : [netColor],
      legend: {
        // Net mode is one series; its color (sign) explains itself.
        show: mode === 'breakdown',
        bottom: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: getThemeColor('body-color'), fontSize: 11 }
      },
      grid: {
        left: 8,
        right: 8,
        top: 16,
        bottom: mode === 'breakdown' ? 44 : 8,
        containLabel: true
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        padding: 10,
        backgroundColor: getThemeColor('body-highlight-bg'),
        borderColor: getThemeColor('border-color'),
        textStyle: { color: getThemeColor('light-text-emphasis') },
        formatter: (params: Array<{ dataIndex: number }>) => {
          const r = rows[params[0]?.dataIndex ?? 0];
          if (!r) return '';
          const line = (label: string, value: string, color?: string) =>
            `<div class="d-flex justify-content-between gap-3 fs-9">` +
            `<span>${color ? `<span class="d-inline-block rounded-circle me-1" style="height:.5rem;width:.5rem;background:${color}"></span>` : ''}${label}</span>` +
            `<span class="font-monospace">${value}</span></div>`;
          const head =
            `<div class="fw-bold mb-1">Epoch ${r.epoch}` +
            (isCurrent(r) ? ' · in progress' : '') +
            (r.consensus === 'alpenglow' ? ' · Alpenglow' : '') +
            `</div>`;
          const body = shown
            .map(d => {
              let label = d.name;
              // Its inflation commission rate, as for MEV; "est." until paid.
              if (d.name === 'Inflation commission') {
                const bps = r.rates?.inflationRewardsCommissionBps;
                const parts = [
                  ...(bps != null
                    ? [
                        `${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
                      ]
                    : []),
                  ...(commission(r)?.estimated ? ['est.'] : [])
                ];
                if (parts.length) label += ` (${parts.join(', ')})`;
              }
              // A participant's latest epochs read null until paid (~a day
              // after the epoch ends): pending, not missing.
              if (
                d.name === 'SFDP reimbursement' &&
                (r.sfdp?.pending ||
                  (r.sfdp === undefined &&
                    sfdpOf(r) == null &&
                    r.epoch >= latestEpoch - 1))
              )
                return line(label, 'pending', d.color);
              if (d.name === 'SFDP reimbursement' && sfdpOf(r) == null)
                return line(label, '—', d.color);
              // Not running Jito: MEV is a dash, not "0".
              if (
                d.name === 'MEV' &&
                r.rates?.mevCommissionBpsSource === 'noTipAccount'
              )
                return line(label, '–', d.color);
              // The MEV commission rate it was taken at: a 0 reads as
              // "0% commission", not missing data.
              if (d.name === 'MEV') {
                const bps = r.rates?.mevCommissionBps;
                label +=
                  bps == null
                    ? ' (rate unknown)'
                    : ` (${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%${r.rates?.mevCommissionBpsSource === 'previousEpoch' ? ', last epoch’s rate' : ''})`;
              }
              if (d.name === 'Vote fees' && !r.costs.voteFeesExact)
                label += ' (est. max)';
              if (d.name === 'VAT' && !r.costs.vatExact) label += ' (est.)';
              const main = line(label, format(d.value(r)), d.color);
              // Alpenglow: what it's a share of - its votes' rewards and
              // its producer bonus (gross).
              const c = commission(r);
              return d.name === 'Inflation commission' && c?.votes != null
                ? main +
                    `<div class="fs-10 text-body-tertiary ps-3">of ${format(convert(r, toSol(c.votes)))} votes + ${format(convert(r, toSol(c.bonus)))} producer bonus (gross)</div>`
                : main;
            })
            .join('');
          const n = netOf(r);
          const net = line(
            `<b>Net</b>${n?.estimated ? ' (est.)' : ''}`,
            n == null
              ? isCurrent(r)
                ? 'after the epoch'
                : 'pending'
              : format(convert(r, toSol(n.value))),
            n != null && n.value < 0 ? lossColor : netColor
          );
          return head + body + `<hr class="my-1" />` + net;
        }
      },
      xAxis: {
        type: 'category',
        data: rows.map(r => String(r.epoch)),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: getThemeColor('tertiary-bg') } },
        axisLabel: {
          color: getThemeColor('secondary-color'),
          fontSize: 11
        }
      },
      yAxis: {
        type: 'value',
        splitLine: {
          lineStyle: { color: getThemeColor('tertiary-bg'), type: 'dashed' }
        },
        axisLabel: {
          color: getThemeColor('secondary-color'),
          fontSize: 11,
          formatter: (v: number) => format(v, true)
        }
      },
      series:
        mode === 'breakdown'
          ? shown.map(d => ({
              name: d.name,
              type: 'bar',
              stack: d.stack,
              barMaxWidth: 18,
              // No hover-to-focus: hovering a legend item faded every other
              // series, and clicking it off left them faded (all bars looked
              // gone), worst on touch where the hover never ends.
              legendHoverLink: false,
              data: rows.map(r => ({
                value: d.value(r),
                // The epoch in progress is partial: fade it.
                itemStyle: isCurrent(r) ? { opacity: 0.4 } : undefined
              }))
            }))
          : [
              {
                name: 'Net',
                type: 'bar',
                barMaxWidth: 18,
                legendHoverLink: false,
                // An estimated net (Alpenglow, commission not paid yet) is
                // drawn faded; a Tower epoch in progress has none.
                data: rows.map(r => {
                  const n = netOf(r);
                  const v = convert(r, toSol(n?.value ?? null));
                  return {
                    value: v,
                    itemStyle: {
                      color: v != null && v < 0 ? lossColor : netColor,
                      opacity: n?.estimated || isCurrent(r) ? 0.4 : 1
                    }
                  };
                })
              }
            ]
    };
  }, [rows, currentEpoch, mode, convert, format, getThemeColor]);

  return (
    <ReactEChartsCore
      echarts={echarts}
      notMerge
      option={option}
      style={{ height: 300, width: '100%' }}
    />
  );
};

export default EarningsChart;
