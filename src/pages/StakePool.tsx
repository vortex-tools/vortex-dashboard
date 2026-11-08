import Badge from 'components/base/Badge';
import BackLink from 'components/common/BackLink';
import { ColumnDef } from '@tanstack/react-table';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import FeatherIcon from 'components/base/FeatherIcon';
import AdvanceTable from 'components/base/AdvanceTable';
import AdvanceTableFooter from 'components/base/AdvanceTableFooter';
import AddressLine from 'components/common/AddressLine';
import PageSkeleton, {
  LinesSkeleton,
  SKELETON
} from 'components/common/PageSkeleton';
import SearchBox from 'components/common/SearchBox';
import SectionCard from 'components/common/SectionCard';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import {
  AdmissionBadge,
  admissionText,
  Delta,
  poolPath,
  bpsPct,
  compactSol,
  pct,
  signedCount,
  signedSol
} from 'components/pools/pools';
import {
  addBy,
  choosersLine,
  directedBy,
  directedDetail,
  directedTotal,
  onlyHolders,
  poolDirectedBy,
  sumBy
} from 'components/pools/directed';
import useAdvanceTable from 'hooks/useAdvanceTable';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import { useAppContext } from 'providers/AppProvider';
import { sfdpMatch } from 'helpers/sfdp';
import {
  FEATURES_KEY,
  VALIDATOR_STATUS_SUMMARY_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';
import { PoolDetail, PoolValidatorRef } from 'providers/vortex-schemas';
import { Fragment, useContext, useEffect, useMemo, useState } from 'react';
import { ButtonGroup, Col, Row, Table, ToggleButton } from 'react-bootstrap';
import { Link, Navigate, useLocation, useParams } from 'react-router';

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  CanvasRenderer
]);

/** A validator it delegates to; `dropped` marks a row added for one it
 *  stopped delegating to (the Changes view), which has no stake now. */
type Validator = PoolDetail['validators'][number] & {
  dropped?: boolean;
  /** A row of only its undirected or directed stake (no change since
   *  the epoch before: that's of its whole stake). */
  part?: boolean;
};

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

/** PMPE (SOL per 1,000 SOL of stake per epoch) as Marinade shows it. */
const pmpe = (v: number | null | undefined) =>
  v == null ? '—' : v.toFixed(v >= 1 ? 3 : 4);
/** The cap that bound a validator's auction stake, in words. */
const CAP: Record<string, string> = {
  WANT: 'its own max',
  BOND: 'its bond',
  ASO: 'operator share',
  COUNTRY: 'country share',
  VALIDATOR: 'validator share',
  MNDE: 'MNDE votes'
};
const auctionColumns: ColumnDef<Validator>[] = [
  {
    id: 'offer',
    header: () => (
      <span title="What it offers stakers in Marinade's auction, per 1,000 SOL per epoch: its on-chain yield (inflation, MEV) plus its bid">
        Offer
      </span>
    ),
    accessorFn: v => v.auction?.totalPmpe ?? undefined,
    sortUndefined: 'last',
    cell: ({ row: { original: v } }) => (
      <span
        title={
          v.auction?.onchainPmpe != null
            ? `${pmpe(v.auction.onchainPmpe)} on chain + ${pmpe(v.auction.effectiveBidPmpe)} bid`
            : undefined
        }
      >
        {pmpe(v.auction?.totalPmpe)}
        {v.auction?.eligible === false && (
          <span
            className="badge badge-soft badge-soft-secondary ms-2"
            title="Not eligible in this run"
          >
            Ineligible
          </span>
        )}
      </span>
    ),
    meta: END
  },
  {
    id: 'bid',
    header: () => (
      <span title="The bid it pays per the auction, per 1,000 SOL per epoch (its posted bid on hover)">
        Bid
      </span>
    ),
    accessorFn: v => v.auction?.effectiveBidPmpe ?? undefined,
    sortUndefined: 'last',
    cell: ({ row: { original: v } }) => (
      <span
        title={
          v.auction?.bidCpmpe != null
            ? `Posted bid ${pmpe(v.auction.bidCpmpe)}`
            : undefined
        }
      >
        {pmpe(v.auction?.effectiveBidPmpe)}
      </span>
    ),
    meta: END
  },
  {
    id: 'bond',
    header: () => (
      <span title="The bond backing its bid (health on hover: 1 = exactly covered)">
        Bond
      </span>
    ),
    accessorFn: v => v.auction?.bondLamports ?? undefined,
    sortUndefined: 'last',
    cell: ({ row: { original: v } }) =>
      v.auction?.bondLamports != null ? (
        <span
          title={
            v.auction.bondHealth != null
              ? `Bond health ${v.auction.bondHealth.toFixed(2)}`
              : undefined
          }
        >
          {compactSol(v.auction.bondLamports)}
        </span>
      ) : (
        <span className="text-body-quaternary">—</span>
      ),
    meta: END
  },
  {
    id: 'cap',
    header: () => (
      <span title="What limited its stake in the auction">Capped by</span>
    ),
    accessorFn: v => v.auction?.caps?.binding ?? undefined,
    sortUndefined: 'last',
    cell: ({ row: { original: v } }) => {
      const b = v.auction?.caps?.binding;
      return b ? (
        <span className="text-nowrap">{CAP[b] ?? b.toLowerCase()}</span>
      ) : (
        <span className="text-body-quaternary">—</span>
      );
    },
    meta: { cellProps: { className: 'text-body-secondary' } }
  }
];

/** Marinade's auction run that allocated the epoch: what the winning
 *  validators offer stakers, per 1,000 SOL per epoch and as a yearly rate,
 *  and the stake it allocated (both Marinade pools). */
const AuctionRun = ({
  run,
  epochsPerYear
}: {
  run: NonNullable<PoolDetail['auctionRun']>;
  epochsPerYear: number | null;
}) => (
  <SectionCard
    title={`Auction · epoch ${run.epoch.toLocaleString()}`}
    icon="trending-up"
    info="Marinade's Stake Auction Marketplace places this stake: each epoch validators bid for it, backed by a bond, and are ranked by what they offer stakers (their on-chain yield plus their bid). The run allocates both Marinade pools. PMPE: SOL per 1,000 SOL of stake per epoch."
  >
    <div className="d-flex flex-wrap column-gap-5 row-gap-2 fs-9">
      {run.winningTotalPmpe != null && (
        <div>
          <span className="text-body-tertiary">Winning offer </span>
          <span className="font-monospace fw-semibold">
            {pmpe(run.winningTotalPmpe)}
          </span>
          <span className="text-body-tertiary"> per 1,000 SOL per epoch</span>
          {epochsPerYear && (
            <span className="text-body-tertiary">
              {' '}
              (≈{' '}
              {((run.winningTotalPmpe / 1000) * epochsPerYear * 100).toFixed(1)}
              % a year)
            </span>
          )}
        </div>
      )}
      {run.tvlLamports != null && (
        <div>
          <span className="text-body-tertiary">Stake auctioned </span>
          <span className="font-monospace fw-semibold">
            {compactSol(run.tvlLamports)}
          </span>
          <span className="text-body-tertiary"> (mSOL and Native)</span>
        </div>
      )}
    </div>
  </SectionCard>
);

const columns = (
  isSfdp: boolean,
  showOther: boolean,
  showRewards: boolean,
  showDirected: boolean,
  showAuction: boolean
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
      // The name truncates; its New / Dropped badge stays whole after it.
      <span
        className="d-flex align-items-center min-w-0"
        style={{ maxWidth: 'min(50vw, 22rem)' }}
      >
        <span className="text-truncate min-w-0">
          <ValidatorLink v={v} />
        </span>
        {v.dropped ? (
          <span className="badge badge-soft badge-soft-danger ms-2 flex-shrink-0">
            Dropped
          </span>
        ) : (
          // New: no stake from it the epoch before (none, or 0).
          !v.part &&
          !v.stakePrev && (
            <span className="badge badge-soft badge-soft-success ms-2 flex-shrink-0">
              New
            </span>
          )
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
        {!v.part && (
          <Delta now={v.stake} prev={v.stakePrev} format={signedSol} below />
        )}
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
  // The part of its stake here someone chose rather than the pool's own
  // selection (who, on hover).
  ...(showDirected
    ? [
        {
          id: 'directed',
          header: 'Directed',
          accessorFn: (v: Validator) => directedTotal(v),
          cell: ({ row: { original: v } }: { row: { original: Validator } }) =>
            directedTotal(v) ? (
              <span title={directedDetail(v)}>
                {compactSol(directedTotal(v))}
                {/* The previous epoch's figure counts holders only. */}
                {onlyHolders(v) && (
                  <Delta
                    now={directedTotal(v)}
                    prev={v.directedStakePrev}
                    format={signedSol}
                    below
                  />
                )}
              </span>
            ) : (
              <span
                className="text-body-quaternary"
                title={directedDetail(v) || undefined}
              >
                —
              </span>
            ),
          meta: END
        } as ColumnDef<Validator>
      ]
    : []),
  // Marinade: its place in the auction (PMPE: SOL per 1,000 SOL of stake
  // per epoch) - its whole offer to stakers, the bid it pays, its bond,
  // and the cap that bound its stake.
  ...(showAuction ? auctionColumns : []),
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

type DistView = 'all' | 'undirected' | 'directed';

/** Who a pool stakes to, ranked: each validator's share of the pool as a
 *  bar, and the running total as a line (how few hold most of it). */
const DistributionChart = ({
  validators,
  of = 'the pool'
}: {
  validators: Validator[];
  /** What the shares are of, for the tooltip. */
  of?: string;
}) => {
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
      confine: true,
      trigger: 'axis',
      backgroundColor: getThemeColor('body-highlight-bg'),
      borderColor: getThemeColor('border-color'),
      textStyle: { color: getThemeColor('body-color') },
      formatter: (ps: Array<{ dataIndex: number }>) => {
        const i = ps[0]?.dataIndex ?? 0;
        const v = top[i];
        return v
          ? `#${i + 1} ${v.name ?? short(v.voteKey)}<br/>${pct(v.shareOfPool, 2)} of ${of} · top ${i + 1}: ${pct(cumulative[i])}`
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
    // In M (or K), with the decimals the tick spacing (about a fifth of
    // the range) needs, the same on every label: "◎23.70M" / "◎23.75M",
    // and for mSOL's ◎2.6K range "◎2.2350M" / "◎2.2355M", never a repeat.
    const need = (size: number) =>
      Math.max(0, Math.ceil(Math.log10((size * 5) / Math.max(stakeRange, 1))));
    // Past 4 decimals of M (a range under ~◎500), K reads better.
    const inM = sol >= 1e6 && need(1e6) <= 4;
    const [n, unit] = inM ? [sol / 1e6, 'M'] : [sol / 1e3, 'K'];
    const digits = Math.min(4, need(inM ? 1e6 : 1e3));
    return `◎${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}${unit}`;
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
      confine: true,
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

/** The validators an epoch added, dropped or moved: the first `max` (by
 *  `order`, else as given), the rest as "and N more". */
const RefList = ({
  refs: all,
  more: moreGiven,
  value,
  max,
  order
}: {
  refs: PoolValidatorRef[];
  more: number;
  value: (r: PoolValidatorRef) => string | null;
  max: number;
  order?: (r: PoolValidatorRef) => number;
}) => {
  const sorted = order ? [...all].sort((a, b) => order(b) - order(a)) : all;
  const refs = sorted.slice(0, max);
  const more = moreGiven + sorted.length - refs.length;
  return refs.length ? (
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
};

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
  // Without the listing, nothing says the name is wrong: the API is.
  if (!listing)
    return context?.poolsState.error ? (
      <UntrackedState>
        Stake pools aren&apos;t available right now.
      </UntrackedState>
    ) : (
      <LinesSkeleton rows={4} />
    );
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
  const { search } = useLocation();
  const context = useContext(VortexDataContext);
  const slice = context?.poolState;
  const fetchData = slice?.fetchData;
  const data = slice?.data.get(name);
  useEffect(() => {
    if (name) fetchData?.(name);
  }, [name, fetchData]);
  const isSfdp = data?.kind === 'sfdp';
  // SFDP: the matching rule and each validator's standing against it.
  const fetchSummary = context?.validatorStatusSummaryState.fetchData;
  useEffect(() => {
    if (isSfdp) fetchSummary?.(VALIDATOR_STATUS_SUMMARY_KEY);
  }, [isSfdp, fetchSummary]);
  const summary = context?.validatorStatusSummaryState.data.get(
    VALIDATOR_STATUS_SUMMARY_KEY
  );
  // How many it delegates to sit at the program's cap (the validator
  // page's "Capped"): more outside stake earns them no more matching.
  const atCap = useMemo(() => {
    const program = summary?.sfdpProgram;
    if (!isSfdp || !summary || !program) return null;
    let capped = 0;
    let matched = 0;
    for (const v of summary.validators) {
      const m = sfdpMatch(
        v.sfdpState,
        {
          effective: v.sfdpStake,
          externalStake: v.externalStake,
          shortfall: v.sfdpShortfall,
          inTransition: v.sfdpInTransition,
          eligible: v.sfdpEligible,
          retiring: v.sfdpRetiring
        },
        program
      );
      if (m?.kind === 'capped') capped++;
      if (m?.kind === 'capped' || m?.kind === 'uncapped') matched++;
    }
    return { capped, matched, cap: program.cap };
  }, [isSfdp, summary]);
  // Shown once the API counts other pools per validator.
  const showOther = !!data?.validators.some(v => v.otherPools != null);
  // Shown once the API gives the pool's rewards per validator.
  const showRewards = !!data?.validators.some(v => v.inflationReward != null);
  // And its directed stake (JitoSOL, bSOL, JSOL, vSOL): chosen by its
  // holders, a protocol, the pool itself or matching.
  // Marinade's pools: each validator's place in the auction.
  const showAuction = !!data?.validators.some(v => v.auction);
  // Only where some of it is (JitoSOL's directed sources are all the
  // pool's or a protocol's).
  const showDirected = !!data?.validators.some(v => directedTotal(v) > 0);
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
  // The Distribution card's view: all its stake, only what it chose itself
  // (less every directed source, the pool's own targets too), or only the
  // directed. Each re-ranked, with shares of that part.
  const [distView, setDistView] = useState<DistView>('all');
  const distParts = useMemo(() => {
    const part = (amount: (v: Validator) => number) => {
      const rows = validators
        .map(v => ({ v, stake: Math.max(0, amount(v)) }))
        .filter(r => r.stake > 0)
        .sort((a, b) => b.stake - a.stake);
      const total = rows.reduce((a, r) => a + r.stake, 0);
      return {
        total,
        validators: rows.map(r => ({
          ...r.v,
          stake: r.stake,
          shareOfPool: total ? r.stake / total : 0
        }))
      };
    };
    return {
      // A remainder under 1% of its stake is the directed figure's
      // rounding (bought or targeted vs what's actually delegated), not
      // stake the pool chose.
      undirected: part(v => {
        const rest = v.stake - directedTotal(v);
        return rest < v.stake * 0.01 ? 0 : rest;
      }),
      directed: part(v => Math.min(v.stake, directedTotal(v)))
    };
  }, [validators]);
  // The Validators card's view: all of them, or the latest epoch's adds
  // (a filter of the table) or drops (no longer in it: their own list).
  const [view, setView] = useState<
    'all' | 'undirected' | 'directed' | 'changes'
  >('all');
  // Undirected / Directed: each validator's row with only that part of
  // its stake, its shares of the pool and of the validator scaled to it.
  const tablePart = (part: 'undirected' | 'directed') => {
    const poolStake = validators.reduce((a, v) => a + v.stake, 0);
    return distParts[part].validators.map(r => {
      const whole = validators.find(v => v.voteKey === r.voteKey);
      const f = whole?.stake ? r.stake / whole.stake : 0;
      return {
        ...r,
        part: true,
        shareOfPool: poolStake ? r.stake / poolStake : null,
        shareOfValidator:
          whole?.shareOfValidator != null ? whole.shareOfValidator * f : null
      } as Validator;
    });
  };
  const latest = data?.history.length
    ? data.history[data.history.length - 1]
    : null;
  const churn = latest?.compared ? latest : null;
  // The Validators card's filter: all, the directed ones, the latest
  // epoch's adds and drops.
  const viewOptions: Array<[typeof view, string]> = [
    ['all', 'All'],
    ...(showDirected
      ? ([
          ['undirected', 'Undirected'],
          ['directed', 'Directed']
        ] as Array<[typeof view, string]>)
      : []),
    ...(churn ? [['changes', 'Changes'] as [typeof view, string]] : [])
  ];
  const shown = useMemo(
    () =>
      view === 'undirected' || view === 'directed'
        ? tablePart(view)
        : view === 'changes' && churn
          ? [
              // Added: their rows (marked New); dropped: a row each, with
              // no stake now and what it held before.
              ...validators.filter(v =>
                churn.added.some(a => a.voteKey === v.voteKey)
              ),
              ...churn.dropped.map(
                d =>
                  ({
                    voteKey: d.voteKey,
                    identity: null,
                    name: d.name,
                    stake: 0,
                    stakePrev: d.stakePrev ?? null,
                    shareOfPool: null,
                    shareOfValidator: null,
                    dropped: true
                  }) as unknown as Validator
              )
            ]
          : validators,
    // tablePart reads distParts and validators.
    [view, validators, churn, distParts]
  );
  // A part's rewards would be of its whole stake: not shown there.
  const isPart = view === 'undirected' || view === 'directed';
  const table = useAdvanceTable({
    columns: useMemo(
      () =>
        columns(
          isSfdp,
          showOther,
          showRewards && !isPart,
          showDirected,
          showAuction
        ),
      [isSfdp, showOther, showRewards, isPart, showDirected, showAuction]
    ),
    data: shown,
    sortable: true,
    pagination: true,
    pageSize: 10,
    getRowId: v => v.voteKey,
    resetPageKey: view,
    initialState: { sorting: [{ id: 'stake', desc: true }] }
  });
  const [open, setOpen] = useState<number | null>(null);

  if (!data)
    return (
      <div className={slice?.error ? 'mb-9 pt-4' : 'mb-9'}>
        {slice?.error ? (
          <PoolNotFound name={name} />
        ) : (
          <PageSkeleton header headerLines={3} rows={SKELETON.pool} />
        )}
      </div>
    );

  // Addressed by a former name (or another case of it): the API answers
  // under its name, so move there (the Worker 301s opened links too).
  if (data.name !== name)
    return <Navigate to={`${poolPath(data.name)}${search}`} replace />;

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
  // Each part on the stake it was paid on: inflation on the stake
  // effective during the epoch (stakePrev), MEV and priority fees on the
  // epoch-end stake (Jito's snapshot) - one base for both overstates a
  // pool whose stake fell at the epoch's end.
  const totalReward = validators.reduce((a, v) => a + rewardOf(v), 0);
  const totalMev = validators.reduce((a, v) => a + (v.mevReward ?? 0), 0);
  const earning = validators.filter(v => v.inflationReward != null);
  const inflBase = earning.reduce((a, v) => a + (v.stakePrev ?? 0), 0);
  const tipBase = validators.reduce((a, v) => a + v.stake, 0);
  const epochRate =
    (inflBase > 0
      ? earning.reduce((a, v) => a + (v.inflationReward ?? 0), 0) / inflBase
      : 0) +
    (tipBase > 0
      ? validators.reduce(
          (a, v) => a + (v.mevReward ?? 0) + (v.priorityFeeReward ?? 0),
          0
        ) / tipBase
      : 0);
  const apy =
    showRewards && (inflBase > 0 || tipBase > 0) && epochsPerYear
      ? (1 + epochRate) ** epochsPerYear - 1
      : null;
  // The same, after the pool's commission comes off each epoch's rewards.
  const apyNet =
    apy != null && fee?.epochFeeBps != null && epochsPerYear
      ? (1 + epochRate * (1 - fee.epochFeeBps / 10000)) ** epochsPerYear - 1
      : null;
  // Its directed stake by who chose it: from the per-validator sources
  // where the API lists them (the column's figures), else its own sums.
  const hasSources = validators.some(v => v.directedSources != null);
  const d = data.directed;
  const directed = hasSources
    ? {
        by: addBy(validators.map(directedBy)),
        validators: validators.filter(v => directedTotal(v) > 0).length,
        basis: d?.basis ?? null
      }
    : d
      ? {
          by: poolDirectedBy(data),
          validators: d.validators,
          basis: d.basis
        }
      : null;
  const directedStake = directed ? sumBy(directed.by) : 0;
  const history = data.history;
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const newest = [...history].reverse();

  return (
    <div className="mb-9">
      <div className="page-header row g-3 align-items-start justify-content-between">
        <div className="col">
          <h1 className="h3 d-flex align-items-center gap-2">
            {data.name}
            <span className="fs-10">
              <AdmissionBadge admission={data.info?.admission} />
            </span>
          </h1>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">{data.fullName}</p>
          {/* Curated: who runs it and how it picks validators. */}
          {data.info?.description && (
            <p className="fs-9 text-body-secondary lh-sm mb-0 mt-1 w-100">
              {data.info.description}
            </p>
          )}
          {/* Who can get in, and where the pool says so. */}
          {data.info?.admission && (
            <p className="fs-10 text-body-tertiary lh-sm mb-0 mt-1 w-100">
              {admissionText(data.info.admission)}
              {data.info.admission.sourceUrl && (
                <>
                  {' '}
                  <a
                    href={data.info.admission.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    source ↗
                  </a>
                </>
              )}
            </p>
          )}
        </div>
        <div className="col-auto d-flex flex-wrap gap-2">
          {data.info?.website && (
            <a
              href={data.info.website}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm btn-soft-secondary"
            >
              Website ↗
            </a>
          )}
          {data.info?.docsUrl && (
            <a
              href={data.info.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm btn-soft-secondary"
            >
              Docs ↗
            </a>
          )}
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
          {isSfdp && atCap && (
            <Col xs={6} lg>
              <StatCard
                label="At the Cap"
                value={atCap.capped.toLocaleString()}
                wrapSublabel
                sublabel={`of ${atCap.matched.toLocaleString()} matched · cap ${compactSol(atCap.cap)}`}
              />
            </Col>
          )}
          {showRewards && !isSfdp && (
            <Col xs={6} lg>
              <StatCard
                label="Staking Yield"
                value={apy != null ? `≈ ${(apy * 100).toFixed(2)}%` : '—'}
                wrapSublabel
                sublabel={
                  <>
                    {apy != null &&
                      (apyNet != null && fee?.epochFeeBps != null
                        ? `${(apyNet * 100).toFixed(2)}% after commission`
                        : 'before commission')}
                    {/* The split on hover. */}
                    <span
                      className="d-block"
                      title={
                        totalMev > 0
                          ? `Epoch ${data.epoch?.toLocaleString() ?? '—'}: ${compactSol(totalReward - totalMev)} inflation · ${compactSol(totalMev)} MEV`
                          : undefined
                      }
                    >
                      {compactSol(totalReward)} last epoch
                    </span>
                  </>
                }
              />
            </Col>
          )}
          {directed && directedStake > 0 && data.stake > 0 && (
            <Col xs={6} lg>
              {/* Stake someone chose rather than its own selection, and
                  who: its holders, a protocol, the pool itself, matching. */}
              <StatCard
                label="Directed"
                value={pct(directedStake / data.stake)}
                wrapSublabel
                sublabel={
                  <>
                    {compactSol(directedStake)}
                    {directed.validators != null &&
                      ` to ${directed.validators.toLocaleString()} ${directed.validators === 1 ? 'validator' : 'validators'}`}
                    {directed.basis === 'target' && ' · target'}
                    <span className="d-block">{choosersLine(directed.by)}</span>
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

        {data.auctionRun && (
          <AuctionRun run={data.auctionRun} epochsPerYear={epochsPerYear} />
        )}

        {/* What staking with it costs, near the top. */}
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

        <Row className="g-3">
          <Col xs={12} lg={6}>
            <SectionCard
              title="Distribution"
              icon="bar-chart-2"
              info="The validators it stakes to, largest first: each one's share of the pool as a bar, and the running total as a line - how few validators hold most of the pool. Undirected: only the stake it chose itself, every directed source taken out (holders', protocols', bought, matching and its own set targets). Directed: only those."
              aside={
                showDirected ? (
                  <ButtonGroup size="sm">
                    {(
                      [
                        ['all', 'All'],
                        ['undirected', 'Undirected'],
                        ['directed', 'Directed']
                      ] as Array<[DistView, string]>
                    ).map(([k, label]) => (
                      <ToggleButton
                        key={k}
                        id={`pool-dist-${k}`}
                        type="radio"
                        name="pool-dist"
                        variant="soft-secondary"
                        value={k}
                        checked={distView === k}
                        onChange={() => setDistView(k)}
                      >
                        {label}
                      </ToggleButton>
                    ))}
                  </ButtonGroup>
                ) : undefined
              }
            >
              {(() => {
                const view = showDirected ? distView : 'all';
                const part = view === 'all' ? null : distParts[view];
                const shown = part ? part.validators : validators;
                const whole = part
                  ? distParts.undirected.total + distParts.directed.total
                  : 0;
                if (!shown.length)
                  return (
                    <UntrackedState>
                      {view === 'undirected'
                        ? 'All of its stake is directed.'
                        : view === 'directed'
                          ? 'None of its stake is directed.'
                          : 'No validators this epoch.'}
                    </UntrackedState>
                  );
                const top10 = shown
                  .slice(0, 10)
                  .reduce((a, v) => a + (v.shareOfPool ?? 0), 0);
                return (
                  <>
                    <DistributionChart
                      validators={shown}
                      of={view === 'all' ? 'the pool' : `its ${view} stake`}
                    />
                    {part && (
                      <p className="fs-10 text-body-tertiary mt-2 mb-0">
                        {pct(whole ? part.total / whole : 0)} of the pool (
                        {compactSol(part.total)}) is{' '}
                        {view === 'directed' ? 'directed' : 'undirected'}, on{' '}
                        {shown.length.toLocaleString()} validator
                        {shown.length === 1 ? '' : 's'}
                        {shown.length > 10 &&
                          `; the top 10 hold ${pct(top10)} of it`}
                        .
                      </p>
                    )}
                  </>
                );
              })()}
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
          info="Every validator it delegates to (over 50 SOL), by stake: its share of the pool, what it earned there (inflation, MEV and priority fees), and whether SFDP and other pools delegate too. Changes: the latest epoch's adds and drops."
          aside={
            churn || showDirected ? (
              <ButtonGroup size="sm">
                {viewOptions.map(([k, label]) => (
                  <ToggleButton
                    key={k}
                    id={`pool-validators-${k}`}
                    type="radio"
                    name="pool-validators"
                    variant="soft-secondary"
                    value={k}
                    checked={view === k}
                    onChange={() => setView(k)}
                  >
                    {label}
                  </ToggleButton>
                ))}
              </ButtonGroup>
            ) : undefined
          }
        >
          {isPart && (
            <p className="fs-10 text-body-tertiary mb-2">
              {view === 'undirected'
                ? 'Only the stake it chose itself on each validator: every directed source taken out.'
                : 'Only its directed stake on each validator.'}{' '}
              Of the pool: that stake&apos;s share of the whole pool.
            </p>
          )}
          {view === 'changes' && churn && (
            <p className="fs-10 text-body-tertiary mb-2">
              Epoch {churn.epoch.toLocaleString()}: the validators it started
              delegating to (New) and stopped delegating to (Dropped, with its
              stake there before)
              {churn.moreAdded + churn.moreDropped > 0 &&
                ` - and ${(churn.moreAdded + churn.moreDropped).toLocaleString()} more in Epoch Changes`}
            </p>
          )}
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
          title="Epoch Changes"
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
                      {/* Striped by epoch: a Details row doesn't shift it. */}
                      <tr className={i % 2 === 0 ? 'stripe' : undefined}>
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
                                  max={10}
                                  order={r => r.stake ?? 0}
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
                                  max={10}
                                  order={r => r.stakePrev ?? 0}
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
                                  // The biggest moves: most epochs move nearly
                                  // every validator a little (rewards).
                                  max={5}
                                  order={r => Math.abs(r.net ?? 0)}
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
