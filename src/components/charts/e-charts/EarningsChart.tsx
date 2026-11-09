import { noPointer } from 'helpers/echart-utils';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { jitoSol } from 'helpers/utils';
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
 * earned plus its production rewards x the commission rate (the same split
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
      (sfdpOf(r) ?? 0) +
      (r.income.bamBoost ?? 0) -
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
    // its votes earned + its production rewards) x the commission rate.
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
        name: 'BAM Boost',
        color: getThemeColor('info'),
        stack: 'income',
        value: r => convert(r, toSol(r.income.bamBoost))
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
    // And BAM Boost's while it was in no distribution.
    const boost = rows.some(r => r.income.bamBoost != null);
    const shown = defs.filter(
      d =>
        (d.name !== 'VAT' || rows.some(r => r.costs.vat > 0)) &&
        (d.name !== 'SFDP reimbursement' || sfdp) &&
        (d.name !== 'BAM Boost' || boost)
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
        // Wider than half the chart: flipped left of the pointer mid-chart
        // it ran past the card's edge and was clipped. Keep it inside.
        confine: true,
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
          // Alpenglow votes are free: no vote fees row; VAT came with
          // Alpenglow: none before it.
          const body = shown
            .filter(d =>
              r.consensus === 'alpenglow'
                ? d.name !== 'Vote fees'
                : d.name !== 'VAT'
            )
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
              // SFDP: only what it was paid. Nothing (or 0) is left out -
              // the program tails off, and some validators never had it -
              // and an unpaid latest epoch reads pending only when the epoch
              // before was reimbursed (it's still in the program).
              if (d.name === 'SFDP reimbursement') {
                const v = sfdpOf(r);
                if (v == null || v <= 0) {
                  const before = rows.find(x => x.epoch === r.epoch - 1);
                  const stillIn = (before ? (sfdpOf(before) ?? 0) : 0) > 0;
                  const unpaid =
                    r.sfdp?.pending ||
                    (r.sfdp === undefined &&
                      v == null &&
                      r.epoch >= latestEpoch - 1);
                  return unpaid && stillIn
                    ? line(label, 'pending', d.color)
                    : '';
                }
              }
              // Not running Jito: no MEV line.
              if (
                d.name === 'MEV' &&
                r.rates?.mevCommissionBpsSource === 'noTipAccount'
              )
                return '';
              // The MEV commission rate it was taken at: a 0 reads as
              // "0% commission", not missing data.
              if (d.name === 'MEV') {
                const bps = r.rates?.mevCommissionBps;
                label +=
                  bps == null
                    ? ' (rate unknown)'
                    : ` (${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%${r.rates?.mevCommissionBpsSource === 'previousEpoch' ? ', last epoch’s rate' : ''}${r.mevCommissionBasis === 'estimated' ? ', est.' : ''})`;
              }
              // BAM Boost: paid in JitoSOL (valued at the epoch's rate);
              // claimable counts as pending, expired as nothing.
              if (d.name === 'BAM Boost') {
                const b = r.bamBoost;
                // Not in the distribution: no line, not a dash.
                if (r.income.bamBoost == null) return '';
                // Expired: nothing (no zero lines).
                if (b?.state === 'expired') return '';
                if (b?.state === 'claimable') label += ' (pending)';
                const main = line(label, format(d.value(r)), d.color);
                return b
                  ? main +
                      `<div class="fs-10 text-body-tertiary ps-3">${jitoSol(b.jitoSol, 2)}${b.solPerJitoSol ? ` at ${b.solPerJitoSol.toFixed(4)} SOL each` : ''}${b.state === 'claimable' ? ', not claimed yet' : ''}</div>`
                  : main;
              }
              if (d.name === 'Vote fees' && !r.costs.voteFeesExact)
                label += ' (est. max)';
              if (d.name === 'VAT' && !r.costs.vatExact) label += ' (est.)';
              // No lines for zero: only what it earned or paid.
              if (d.value(r) === 0) return '';
              const main = line(label, format(d.value(r)), d.color);
              // Alpenglow: what it's a share of - its votes' rewards and
              // its production rewards (gross).
              const c = commission(r);
              const sub = (text: string) =>
                `<div class="fs-10 text-body-tertiary ps-3">${text}</div>`;
              if (d.name === 'Inflation commission' && c?.votes != null)
                return (
                  main +
                  sub(
                    `of ${format(convert(r, toSol(c.votes)))} votes + ${format(convert(r, toSol(c.bonus)))} production rewards (gross)`
                  )
                );
              // MEV: what it's a share of - the tips in its blocks (gross,
              // before the builder's and tip router's fees); at 0% all of
              // it goes to its stakers.
              const tips = r.blockRevenue.mevTips;
              if (d.name === 'MEV' && tips > 0)
                return (
                  main +
                  sub(
                    `of ${format(convert(r, toSol(tips)))} gross tips${r.rates?.mevCommissionBps === 0 ? ' · all to stakers' : ''}`
                  )
                );
              return main;
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
      option={noPointer(option)}
      style={{ height: 300, width: '100%' }}
    />
  );
};

export default EarningsChart;
