import Badge from 'components/base/Badge';
import BackLink from 'components/common/BackLink';
import { ColumnDef } from '@tanstack/react-table';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import FeatherIcon from 'feather-icons-react';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import AddressLine from 'components/common/AddressLine';
import DelayedSpinner from 'components/common/DelayedSpinner';
import SearchBox from 'components/common/SearchBox';
import SectionCard from 'components/common/SectionCard';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import {
  Delta,
  KindBadge,
  poolPath,
  bpsPct,
  compactSol,
  pct,
  signedCount,
  signedSol
} from 'components/pools/pools';
import useAdvanceTable from 'hooks/useAdvanceTable';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import { useAppContext } from 'providers/AppProvider';
import { FEATURES_KEY, VortexDataContext } from 'providers/VortexDataProvider';
import { PoolDetail, PoolValidatorRef } from 'providers/vortex-schemas';
import { Fragment, useContext, useEffect, useMemo, useState } from 'react';
import { Col, Row, Table } from 'react-bootstrap';
import { Link, Navigate, useParams } from 'react-router';

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  CanvasRenderer
]);

type Validator = PoolDetail['validators'][number];

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const ValidatorLink = ({ v }: { v: PoolValidatorRef | Validator }) => (
  <Link to={`/validator/${v.voteKey}`} title={v.name ?? v.voteKey}>
    {v.name ?? short(v.voteKey)}
  </Link>
);

const NOWRAP = {
  headerProps: { className: 'text-nowrap' },
  cellProps: { className: 'text-nowrap' }
};
/** A pool's minimum stake (lamports): holdings at or below it aren't
 *  delegations. */
const MIN_STAKE = 50e9;

const CENTER = {
  headerProps: { className: 'text-nowrap text-center' },
  cellProps: { className: 'text-nowrap text-center' }
};
const END = {
  headerProps: { className: 'text-nowrap text-end' },
  cellProps: { className: 'text-nowrap text-end font-monospace' }
};

/** What the pool earned on a validator this epoch: inflation, MEV and
 *  priority-fee rewards. */
const rewardOf = (v: Validator) =>
  (v.inflationReward ?? 0) + (v.mevReward ?? 0) + (v.priorityFeeReward ?? 0);

/** "Inflation ◎12 · MEV ◎3 (after the validator's 8% commission and the
 *  tip router's ◎0.1) · priority fees ◎1". */
const rewardDetail = (v: Validator) =>
  [
    `Inflation ${compactSol(v.inflationReward ?? 0)}`,
    v.mevReward != null &&
      `MEV ${compactSol(v.mevReward)}${
        v.validatorMevFeeBps != null || v.tipRouterFee
          ? ` (after ${[
              v.validatorMevFeeBps != null &&
                `the validator's ${(v.validatorMevFeeBps / 100).toFixed(0)}% commission`,
              v.tipRouterFee && `the tip router's ${compactSol(v.tipRouterFee)}`
            ]
              .filter(Boolean)
              .join(' and ')})`
          : ''
      }`,
    v.priorityFeeReward
      ? `priority fees ${compactSol(v.priorityFeeReward)}`
      : null
  ]
    .filter(Boolean)
    .join(' · ');

const columns = (
  isSfdp: boolean,
  showOther: boolean,
  showRewards: boolean
): ColumnDef<Validator>[] => [
  {
    id: 'rank',
    header: '#',
    accessorFn: (_, i) => i + 1,
    cell: ({ row }) => (
      <span className="text-body-tertiary">{row.index + 1}</span>
    ),
    enableSorting: false,
    meta: NOWRAP
  },
  {
    id: 'name',
    header: 'Validator',
    accessorFn: v => `${v.name ?? ''} ${v.voteKey} ${v.identity ?? ''}`,
    cell: ({ row: { original: v } }) => (
      <span
        className="d-block text-truncate"
        style={{ maxWidth: 'min(50vw, 22rem)' }}
      >
        <ValidatorLink v={v} />
        {v.stakePrev == null && (
          <span className="badge badge-soft badge-soft-success ms-2">New</span>
        )}
      </span>
    ),
    meta: NOWRAP
  },
  {
    id: 'stake',
    header: 'Stake',
    accessorFn: v => v.stake,
    cell: ({ row: { original: v } }) => (
      <>
        {/* Its stakers, on the validator's Staking tab. */}
        <Link
          to={`/validator/${v.voteKey}/staking`}
          className="text-reset"
          title="Its stakers"
        >
          {compactSol(v.stake)}
        </Link>
        <Delta now={v.stake} prev={v.stakePrev} format={signedSol} below />
      </>
    ),
    meta: END
  },
  {
    id: 'shareOfPool',
    header: 'Of the pool',
    accessorFn: v => v.shareOfPool ?? 0,
    cell: ({ row: { original: v } }) => pct(v.shareOfPool, 2),
    meta: END
  },
  ...(showRewards
    ? [
        {
          id: 'rewards',
          header: 'Epoch rewards',
          accessorFn: (v: Validator) => rewardOf(v),
          cell: ({
            row: { original: v }
          }: {
            row: { original: Validator };
          }) => (
            // Its rewards over epochs, on the validator's Earnings tab.
            <Link
              to={`/validator/${v.voteKey}/earnings`}
              className="text-reset"
              title={rewardDetail(v)}
            >
              {compactSol(rewardOf(v))}
            </Link>
          ),
          meta: END
        } as ColumnDef<Validator>
      ]
    : []),
  ...(isSfdp
    ? []
    : [
        {
          id: 'sfdp',
          header: 'SFDP',
          // Above the 50 SOL minimum, as the pools are counted.
          accessorFn: (v: Validator) =>
            (v.sfdpStake ?? 0) > MIN_STAKE ? 1 : 0,
          cell: ({ row: { original: v } }: { row: { original: Validator } }) =>
            (v.sfdpStake ?? 0) > MIN_STAKE ? (
              <Badge
                bg="success"
                title="SFDP delegates here"
                aria-label="SFDP delegates here"
              >
                <FeatherIcon icon="check" size={11} />
              </Badge>
            ) : (
              <span className="text-body-quaternary">—</span>
            ),
          meta: CENTER
        } as ColumnDef<Validator>
      ]),
  ...(showOther
    ? [
        {
          id: 'otherPools',
          header: 'Other pools',
          accessorFn: (v: Validator) => v.otherPools ?? 0,
          cell: ({ row: { original: v } }: { row: { original: Validator } }) =>
            v.otherPools ? (
              <span
                title={
                  v.otherPoolNames?.length
                    ? v.otherPoolNames.join(', ')
                    : undefined
                }
                style={
                  v.otherPoolNames?.length ? { cursor: 'help' } : undefined
                }
              >
                {v.otherPools.toLocaleString()}
              </span>
            ) : (
              <span className="text-body-quaternary">—</span>
            ),
          meta: END
        } as ColumnDef<Validator>
      ]
    : [])
];

/** Who a pool stakes to, ranked: each validator's share of the pool as a
 *  bar, and the running total as a line (how few hold most of it). */
const DistributionChart = ({ validators }: { validators: Validator[] }) => {
  const { getThemeColor } = useAppContext();
  // Every validator, so the running total reaches the whole pool.
  const top = validators;
  // A label every 10, 25, 50 or 100 ranks: about ten across.
  const step = [10, 25, 50, 100, 250].find(n => top.length / n <= 10) ?? 500;
  let run = 0;
  const cumulative = top.map(v => (run += v.shareOfPool ?? 0));
  const option = {
    animation: false,
    grid: { left: 4, right: 8, top: 16, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: getThemeColor('body-highlight-bg'),
      borderColor: getThemeColor('border-color'),
      textStyle: { color: getThemeColor('body-color') },
      formatter: (ps: Array<{ dataIndex: number }>) => {
        const i = ps[0]?.dataIndex ?? 0;
        const v = top[i];
        return v
          ? `#${i + 1} ${v.name ?? short(v.voteKey)}<br/>${pct(v.shareOfPool, 2)} of the pool · top ${i + 1}: ${pct(cumulative[i])}`
          : '';
      }
    },
    xAxis: {
      type: 'category',
      data: top.map((_, i) => i + 1),
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        fontSize: 10,
        interval: (i: number) => (i + 1) % step === 0 || i === 0
      },
      axisTick: { show: false }
    },
    yAxis: [
      {
        type: 'value',
        axisLabel: {
          color: getThemeColor('tertiary-color'),
          fontSize: 10,
          formatter: (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`
        },
        splitLine: { lineStyle: { color: getThemeColor('border-color') } }
      },
      {
        type: 'value',
        min: 0,
        max: 1,
        axisLabel: {
          color: getThemeColor('tertiary-color'),
          fontSize: 10,
          formatter: (v: number) => `${Math.round(v * 100)}%`
        },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: 'Share of the pool',
        type: 'bar',
        data: top.map(v => v.shareOfPool ?? 0),
        color: getThemeColor('primary'),
        itemStyle: { opacity: 0.55 },
        barCategoryGap: top.length > 150 ? '0%' : '20%'
      },
      {
        name: 'Cumulative',
        type: 'line',
        yAxisIndex: 1,
        symbol: 'none',
        data: cumulative,
        color: getThemeColor('info'),
        lineStyle: { width: 2 }
      }
    ]
  };
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      style={{ height: 220, width: '100%' }}
    />
  );
};

/** The pool's stake (area) and validator count (line) per epoch. */
const HistoryChart = ({ history }: { history: PoolDetail['history'] }) => {
  const { getThemeColor } = useAppContext();
  // Stake labels with as many digits as its range needs: a pool whose
  // stake barely moves read "◎2.23M" on every line.
  const stakes = history.map(h => h.stake);
  const stakeRange = (Math.max(...stakes) - Math.min(...stakes)) / 1e9;
  const stakeLabel = (v: number) => {
    const sol = v / 1e9;
    if (stakeRange >= 1e6 || sol < 1e4) return compactSol(v);
    // The axis's round ticks, with the decimals each needs: "◎23.7M",
    // "◎23.75M", not "◎23,700K".
    const [n, unit] = sol >= 1e6 ? [sol / 1e6, 'M'] : [sol / 1e3, 'K'];
    return `◎${n.toLocaleString('en-US', { maximumFractionDigits: 3 })}${unit}`;
  };
  // Whole validators, with room around a count that hardly moves (56 to
  // 57 drew 56.2, 56.4, ...).
  const counts = history.map(h => h.validators);
  const lo = Math.min(...counts);
  const hi = Math.max(...counts);
  const pad = Math.max(2, Math.ceil((hi - lo) * 0.25));
  const option = {
    animation: false,
    grid: { left: 4, right: 8, top: 16, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: getThemeColor('body-highlight-bg'),
      borderColor: getThemeColor('border-color'),
      textStyle: { color: getThemeColor('body-color') }
    },
    xAxis: {
      type: 'category',
      data: history.map(h => h.epoch),
      axisLabel: { color: getThemeColor('tertiary-color'), fontSize: 10 }
    },
    yAxis: [
      {
        type: 'value',
        scale: true,
        axisLabel: {
          color: getThemeColor('tertiary-color'),
          fontSize: 10,
          formatter: stakeLabel
        },
        splitLine: { lineStyle: { color: getThemeColor('border-color') } }
      },
      {
        type: 'value',
        min: Math.max(0, lo - pad),
        max: hi + pad,
        minInterval: 1,
        axisLabel: { color: getThemeColor('tertiary-color'), fontSize: 10 },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: 'Stake',
        type: 'line',
        symbol: 'none',
        data: history.map(h => h.stake),
        color: getThemeColor('primary'),
        areaStyle: { opacity: 0.15, origin: 'start' },
        tooltip: { valueFormatter: (v: number) => compactSol(v) }
      },
      {
        name: 'Validators',
        type: 'line',
        yAxisIndex: 1,
        symbol: 'circle',
        symbolSize: 4,
        data: history.map(h => h.validators),
        color: getThemeColor('info')
      }
    ]
  };
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      style={{ height: 200, width: '100%' }}
    />
  );
};

const RefList = ({
  refs,
  more,
  value
}: {
  refs: PoolValidatorRef[];
  more: number;
  value: (r: PoolValidatorRef) => string | null;
}) =>
  refs.length ? (
    <ul className="list-unstyled mb-0 fs-10">
      {refs.map(r => (
        <li key={r.voteKey} className="d-flex justify-content-between gap-2">
          <span className="text-truncate">
            <ValidatorLink v={r} />
          </span>
          <span className="font-monospace text-nowrap">{value(r)}</span>
        </li>
      ))}
      {more > 0 && (
        <li className="text-body-tertiary">and {more.toLocaleString()} more</li>
      )}
    </ul>
  ) : (
    <span className="fs-10 text-body-quaternary">none</span>
  );

/**
 * No pool by that name - often one renamed or split since a link was
 * made (Marinade became "Marinade (mSOL)", "Marinade Native" and
 * "Marinade Select"). Looks the name up in a fresh listing: one pool
 * whose name starts with or contains it is opened instead; several are
 * offered.
 */
const PoolNotFound = ({ name }: { name: string }) => {
  const context = useContext(VortexDataContext);
  const fetchPools = context?.poolsState.fetchData;
  useEffect(() => {
    fetchPools?.(FEATURES_KEY, { force: true });
  }, [fetchPools]);
  const listing = context?.poolsState.data.get(FEATURES_KEY);
  const q = name.toLowerCase();
  const matches = (listing?.pools ?? []).filter(p => {
    const n = p.name.toLowerCase();
    return n.startsWith(q) || n.includes(q);
  });
  if (matches.length === 1)
    return <Navigate to={poolPath(matches[0].name)} replace />;
  return (
    <UntrackedState>
      No stake pool named {name}.{' '}
      {matches.length > 1 && (
        <>
          Did you mean{' '}
          {matches.map((p, i) => (
            <Fragment key={p.name}>
              {i > 0 && (i === matches.length - 1 ? ' or ' : ', ')}
              <Link to={poolPath(p.name)}>{p.name}</Link>
            </Fragment>
          ))}
          ?{' '}
        </>
      )}
      <Link to="/pools">All stake pools</Link>
    </UntrackedState>
  );
};

/**
 * One stake pool (or Marinade, or SFDP): who it stakes to at the end of
 * the latest completed epoch - each validator's stake, its share of the
 * pool and of the validator's stake, the change since the epoch before,
 * and SFDP's stake on the same validator - how concentrated that is, and
 * epoch by epoch, its stake, validator count and the validators it added,
 * dropped and moved stake on.
 */
const StakePool = () => {
  const { name: param = '' } = useParams();
  const name = decodeURIComponent(param);
  const context = useContext(VortexDataContext);
  const slice = context?.poolState;
  const fetchData = slice?.fetchData;
  const data = slice?.data.get(name);
  useEffect(() => {
    if (name) fetchData?.(name);
  }, [name, fetchData]);
  const isSfdp = data?.kind === 'sfdp';
  // Shown once the API counts other pools per validator.
  const showOther = !!data?.validators.some(v => v.otherPools != null);
  // Shown once the API gives the pool's rewards per validator.
  const showRewards = !!data?.validators.some(v => v.inflationReward != null);
  // Epochs a year at the epoch's observed length, for an annual yield.
  const progress = context?.currentEpochState.progress;
  const epochsPerYear =
    progress?.slotsInEpoch && progress.slotSeconds
      ? // Rounded: the slot time is re-measured each poll, and a figure
        // that moves would rebuild the table's columns every time.
        Math.round(
          (365 * 86400) / (progress.slotsInEpoch * progress.slotSeconds)
        )
      : null;
  const validators = useMemo(
    () => [...(data?.validators ?? [])].sort((a, b) => b.stake - a.stake),
    [data]
  );
  const table = useAdvanceTable({
    columns: useMemo(
      () => columns(isSfdp, showOther, showRewards),
      [isSfdp, showOther, showRewards]
    ),
    data: validators,
    sortable: true,
    pagination: true,
    pageSize: 25,
    getRowId: v => v.voteKey,
    initialState: { sorting: [{ id: 'stake', desc: true }] }
  });
  const [open, setOpen] = useState<number | null>(null);

  if (!data)
    return (
      <div className="mb-9 pt-4">
        {slice?.error ? (
          <PoolNotFound name={name} />
        ) : (
          <DelayedSpinner loading label="Loading the stake pool…" />
        )}
      </div>
    );

  // Its commission on rewards (not for SFDP, which has none).
  const fee = data.fees?.epochFeeBps != null ? data.fees : null;
  // The middle of its delegations (largest first, so the middle one).
  const median = validators.length
    ? validators.length % 2
      ? validators[(validators.length - 1) / 2].stake
      : (validators[validators.length / 2 - 1].stake +
          validators[validators.length / 2].stake) /
        2
    : null;
  // What the pool earned this epoch, and the annual yield that rate makes.
  const totalReward = validators.reduce((a, v) => a + rewardOf(v), 0);
  const totalMev = validators.reduce((a, v) => a + (v.mevReward ?? 0), 0);
  const apy =
    showRewards && data.stake && epochsPerYear
      ? (1 + totalReward / data.stake) ** epochsPerYear - 1
      : null;
  // The same, after the pool's commission comes off each epoch's rewards.
  const apyNet =
    apy != null && fee?.epochFeeBps != null && epochsPerYear
      ? (1 + (totalReward / data.stake) * (1 - fee.epochFeeBps / 10000)) **
          epochsPerYear -
        1
      : null;
  const history = data.history;
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const newest = [...history].reverse();

  return (
    <div className="mb-9">
      <div className="page-header row g-3 align-items-start justify-content-between">
        <div className="col">
          <h3 className="d-flex align-items-center gap-2">
            {data.name}
            <KindBadge kind={data.kind} name={data.name} />
          </h3>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">{data.fullName}</p>
        </div>
        <div className="col-auto">
          <BackLink to="/pools" label="All stake pools" />
        </div>
      </div>

      <div className="d-flex flex-column gap-3">
        <Row className="g-3">
          <Col xs={6} lg>
            <StatCard
              label="Stake"
              value={compactSol(data.stake)}
              sublabel={
                prev
                  ? `${signedSol(data.stake - prev.stake) ?? 'no change'} since epoch ${prev.epoch.toLocaleString()}`
                  : 'effective, end of epoch'
              }
            />
          </Col>
          <Col xs={6} lg>
            <StatCard
              label="Validators"
              value={validators.length.toLocaleString()}
              wrapSublabel
              sublabel={
                <>
                  {prev
                    ? `${signedCount(validators.length - prev.validators) ?? 'no change'} since epoch ${prev.epoch.toLocaleString()}`
                    : 'delegated to'}
                  {!!data.minimumOnly && (
                    <span
                      className="d-block"
                      title="Validators it holds only its minimum stake on (50 SOL or less): not delegations, not listed"
                    >
                      +{data.minimumOnly.toLocaleString()} at the 50 SOL minimum
                    </span>
                  )}
                </>
              }
            />
          </Col>
          <Col xs={6} lg>
            <StatCard
              label="Median Stake"
              value={median != null ? compactSol(median) : '—'}
              sublabel={
                validators[0]
                  ? `per validator · largest ${compactSol(validators[0].stake)}`
                  : 'per validator'
              }
            />
          </Col>
          {showRewards && (
            <Col xs={6} lg>
              <StatCard
                label="Staking Yield"
                value={apy != null ? `≈ ${(apy * 100).toFixed(2)}%` : '—'}
                wrapSublabel
                sublabel={
                  <>
                    {apy != null &&
                      (apyNet != null && fee?.epochFeeBps != null
                        ? `${(apyNet * 100).toFixed(2)}% after its ${bpsPct(fee.epochFeeBps)} commission`
                        : 'a year, before the pool’s commission')}
                    <span className="d-block">
                      {compactSol(totalReward)} earned in epoch{' '}
                      {data.epoch?.toLocaleString() ?? '—'}
                      {totalMev > 0 &&
                        ` (${compactSol(totalReward - totalMev)} inflation · ${compactSol(totalMev)} MEV)`}
                    </span>
                  </>
                }
              />
            </Col>
          )}
          {fee && (
            <Col xs={6} lg>
              <StatCard
                label="Commission"
                value={bpsPct(fee.epochFeeBps)}
                sublabel={
                  fee.nextEpochFeeBps != null &&
                  fee.nextEpochFeeBps !== fee.epochFeeBps
                    ? `${bpsPct(fee.nextEpochFeeBps)} from next epoch`
                    : 'on staking rewards'
                }
                tone={
                  fee.nextEpochFeeBps != null &&
                  fee.nextEpochFeeBps > (fee.epochFeeBps ?? 0)
                    ? 'warning'
                    : undefined
                }
              />
            </Col>
          )}
        </Row>

        <Row className="g-3">
          <Col xs={12} lg={6}>
            <SectionCard
              title="Distribution"
              icon="bar-chart-2"
              info="The validators it stakes to, largest first: each one's share of the pool as a bar, and the running total as a line - how few validators hold most of the pool."
            >
              {validators.length ? (
                <DistributionChart validators={validators} />
              ) : (
                <UntrackedState>No validators this epoch.</UntrackedState>
              )}
            </SectionCard>
          </Col>
          <Col xs={12} lg={6}>
            <SectionCard
              title="Over Time"
              icon="trending-up"
              info="Its effective stake (area) and how many validators it stakes to (line) at the end of each epoch."
            >
              {history.length > 1 ? (
                <HistoryChart history={history} />
              ) : (
                <UntrackedState>Not enough epochs recorded yet.</UntrackedState>
              )}
            </SectionCard>
          </Col>
        </Row>

        <SectionCard
          title="Validators"
          icon="server"
          info="Every validator it delegates to (over 50 SOL), by stake: its share of the pool, what it earned there (inflation, MEV and priority fees), and whether SFDP and other pools delegate too."
        >
          <AdvanceTableProvider {...table}>
            <div className="mb-3">
              <SearchBox
                placeholder="Search validators, vote or identity keys"
                onChange={e =>
                  table.setGlobalFilter(e.target.value || undefined)
                }
              />
            </div>
            <AdvanceTable
              tableProps={{ size: 'sm', className: 'data-table fs-9 mb-0' }}
            />
            <AdvanceTableFooter viewAll={false} />
          </AdvanceTableProvider>
        </SectionCard>

        <SectionCard
          title="Epoch by Epoch"
          icon="clock"
          info="Each epoch, newest first: its stake, validator count, and the validators it added, dropped or moved stake on. Small moves can be reward noise."
        >
          {newest.length ? (
            <Table
              responsive
              size="sm"
              className="data-table no-stripes fs-9 mb-0"
            >
              <thead>
                <tr>
                  <th>Epoch</th>
                  <th className="text-end">Stake</th>
                  <th className="text-end">Validators</th>
                  <th className="text-end">Added</th>
                  <th className="text-end">Dropped</th>
                  <th className="text-end">Moved</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {newest.map((h, i) => {
                  const before = newest[i + 1];
                  const isOpen = open === h.epoch;
                  const nAdded = h.added.length + h.moreAdded;
                  const nDropped = h.dropped.length + h.moreDropped;
                  const nMoved = h.moved.length + h.moreMoved;
                  return (
                    <Fragment key={h.epoch}>
                      <tr>
                        <td className="font-monospace">
                          {h.epoch.toLocaleString()}
                        </td>
                        <td className="text-end font-monospace text-nowrap">
                          {compactSol(h.stake)}
                          <Delta
                            now={h.stake}
                            prev={before?.stake}
                            format={signedSol}
                            below
                          />
                        </td>
                        <td className="text-end font-monospace">
                          {h.validators.toLocaleString()}
                        </td>
                        <td className="text-end font-monospace text-success">
                          {h.compared ? (nAdded ? `+${nAdded}` : '—') : ''}
                        </td>
                        <td className="text-end font-monospace text-danger">
                          {h.compared ? (nDropped ? `−${nDropped}` : '—') : ''}
                        </td>
                        <td className="text-end font-monospace">
                          {h.compared ? nMoved || '—' : ''}
                        </td>
                        <td className="text-end">
                          {h.compared && (nAdded || nDropped || nMoved) ? (
                            <button
                              type="button"
                              className="btn btn-link btn-sm p-0 fs-10"
                              onClick={() => setOpen(isOpen ? null : h.epoch)}
                              aria-expanded={isOpen}
                            >
                              {isOpen ? 'Hide' : 'Details'}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} className="bg-body-highlight">
                            <Row className="g-3 py-2">
                              <Col xs={12} md={4}>
                                <div className="fs-10 text-uppercase text-body-tertiary mb-1">
                                  Added
                                </div>
                                <RefList
                                  refs={h.added}
                                  more={h.moreAdded}
                                  value={r =>
                                    r.stake != null ? compactSol(r.stake) : null
                                  }
                                />
                              </Col>
                              <Col xs={12} md={4}>
                                <div className="fs-10 text-uppercase text-body-tertiary mb-1">
                                  Dropped
                                </div>
                                <RefList
                                  refs={h.dropped}
                                  more={h.moreDropped}
                                  value={r =>
                                    r.stakePrev != null
                                      ? compactSol(r.stakePrev)
                                      : null
                                  }
                                />
                              </Col>
                              <Col xs={12} md={4}>
                                <div className="fs-10 text-uppercase text-body-tertiary mb-1">
                                  Moved
                                </div>
                                <RefList
                                  refs={h.moved}
                                  more={h.moreMoved}
                                  value={r =>
                                    r.net != null ? signedSol(r.net) : null
                                  }
                                />
                              </Col>
                            </Row>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <UntrackedState>No epochs recorded yet.</UntrackedState>
          )}
        </SectionCard>

        {data.fees && (
          <SectionCard
            title="Fees"
            icon="percent"
            info="Its commission on staking rewards (and next epoch's, if changing), and its deposit and withdrawal fees. From its on-chain account."
          >
            <dl className="row fs-9 mb-0 gy-1">
              {(
                [
                  ['Commission on rewards', data.fees.epochFeeBps],
                  [
                    'Next epoch',
                    data.fees.nextEpochFeeBps != null &&
                    data.fees.nextEpochFeeBps !== data.fees.epochFeeBps
                      ? data.fees.nextEpochFeeBps
                      : undefined
                  ],
                  ['SOL deposit', data.fees.solDepositFeeBps],
                  ['Stake deposit', data.fees.stakeDepositFeeBps],
                  ['SOL withdrawal', data.fees.solWithdrawalFeeBps],
                  ['Stake withdrawal', data.fees.stakeWithdrawalFeeBps],
                  // Only what applies: a scheduled change, a referral cut,
                  // Marinade's liquid unstake.
                  [
                    'SOL withdrawal, next epoch',
                    data.fees.nextSolWithdrawalFeeBps != null &&
                    data.fees.nextSolWithdrawalFeeBps !==
                      data.fees.solWithdrawalFeeBps
                      ? data.fees.nextSolWithdrawalFeeBps
                      : undefined
                  ],
                  [
                    'Stake withdrawal, next epoch',
                    data.fees.nextStakeWithdrawalFeeBps != null &&
                    data.fees.nextStakeWithdrawalFeeBps !==
                      data.fees.stakeWithdrawalFeeBps
                      ? data.fees.nextStakeWithdrawalFeeBps
                      : undefined
                  ],
                  [
                    'Referral share of SOL deposit fees',
                    data.fees.solReferralFeePct
                      ? data.fees.solReferralFeePct * 100
                      : undefined
                  ],
                  [
                    'Referral share of stake deposit fees',
                    data.fees.stakeReferralFeePct
                      ? data.fees.stakeReferralFeePct * 100
                      : undefined
                  ],
                  [
                    'Liquid unstake, from',
                    data.fees.liquidUnstakeMinFeeBps ?? undefined
                  ],
                  [
                    'Liquid unstake, up to',
                    data.fees.liquidUnstakeMaxFeeBps ?? undefined
                  ]
                ] as Array<[string, number | null | undefined]>
              )
                .filter(([, v]) => v !== undefined)
                .map(([label, v]) => (
                  <Fragment key={label}>
                    <dt className="col-6 col-md-3 fw-normal text-body-tertiary">
                      {label}
                    </dt>
                    <dd className="col-6 col-md-3 mb-0 font-monospace">
                      {bpsPct(v)}
                    </dd>
                  </Fragment>
                ))}
            </dl>
          </SectionCard>
        )}

        {data.authorities.length > 0 && (
          <SectionCard title="Authorities" icon="key">
            {data.authorities.map(a => (
              <AddressLine key={a} label="Authority" value={a} />
            ))}
          </SectionCard>
        )}
      </div>
    </div>
  );
};

export default StakePool;
