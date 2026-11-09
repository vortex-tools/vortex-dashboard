import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import PageSkeleton, { SKELETON } from 'components/common/PageSkeleton';
import SectionCard from 'components/common/SectionCard';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import { formatLamports } from 'helpers/utils';
import { useAppContext } from 'providers/AppProvider';
import { BlockBuilder, BlockBuilders } from 'providers/vortex-schemas';
import { VortexDataContext } from 'providers/VortexDataProvider';
import {
  ChangeEvent,
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import {
  ButtonGroup,
  Col,
  Form,
  Row,
  Table,
  ToggleButton
} from 'react-bootstrap';
import { useNavigate, useParams } from 'react-router';

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer
]);

/** The API's group for validators whose client it couldn't read for the
 *  epoch: no builder to show, left out of the charts and table. */
const UNKNOWN = 'unknown';

/** The first epoch with blocks labelled by builder. */
const FIRST_EPOCH = 1066;

const sol = (lamports: number | null) =>
  lamports == null ? '—' : formatLamports(lamports, 4);
const pct = (x: number | null | undefined, digits = 1) =>
  x == null ? '—' : `${(x * 100).toFixed(digits)}%`;
const bps = (b: number | null | undefined) =>
  b == null ? '—' : `${(b / 100).toLocaleString('en-US')}%`;

/** How a builder's tips reach the leader, as a table cell. */
const TIPS: Record<string, string> = {
  tipAccounts: "Jito's tip accounts",
  priorityFees: 'Priority fees',
  ownTipAccounts: 'Its own tip accounts'
};

/** A builder's blocks and what they paid the leader, per block. */
type Row_ = {
  b: BlockBuilder;
  blocks: number;
  /** Share of the epoch's labelled blocks. */
  blockShare: number | null;
  perBlock: {
    base: number;
    priority: number;
    tips: number;
    total: number;
  } | null;
  /** Its tips go to accounts Vortex doesn't read: income understated. */
  understated: boolean;
  /** Average per block after the fees its blocks paid (null: no fees
   *  served), and whether those fees are estimates. */
  keptPerBlock: number | null;
  keptEstimated: boolean;
  /** perBlock after the fees its blocks paid, each taken from the part
   *  it's charged on (null: no fees served). */
  perBlockAfter: Row_['perBlock'];
};

/** A builder's per-block parts after the fees its blocks paid: Jito tip
 *  fees off the tips, shared priority fees' off priority fees, block-fee
 *  commissions off base and priority pro rata; fees on what income
 *  doesn't count (its own tips, the validator's MEV commission) don't. */
const afterFees = (b: BlockBuilder): Row_['perBlock'] => {
  const built = b.built;
  if (!built?.fees || !built.blocks) return null;
  const off = { base: 0, priority: 0, tips: 0 };
  const fees = built.baseFees + built.priorityFees;
  for (const i of built.fees.items) {
    const l = i.lamports ?? 0;
    if (i.base === 'jitoTips') off.tips += l;
    else if (i.base === 'sharedPriorityFees') off.priority += l;
    else if (i.base === 'blockFees' && fees) {
      off.base += (l * built.baseFees) / fees;
      off.priority += (l * built.priorityFees) / fees;
    }
  }
  const per = (v: number) => Math.max(0, v) / built.blocks;
  const base = per(built.baseFees - off.base);
  const priority = per(built.priorityFees - off.priority);
  const tips = per(built.mevTips - off.tips);
  return { base, priority, tips, total: base + priority + tips };
};

const rowsOf = (d: BlockBuilders): Row_[] => {
  const labelled = d.blockLabels?.blocks ?? 0;
  // Not "unknown": validators whose client we couldn't read (see notes).
  return d.builders
    .filter(b => b.builder !== UNKNOWN)
    .map(b => {
      const blocks = b.built?.blocks ?? 0;
      const per = (v: number) => v / blocks;
      return {
        b,
        blocks,
        blockShare: labelled && b.built ? blocks / labelled : null,
        perBlock:
          b.built && blocks
            ? {
                base: per(b.built.baseFees),
                priority: per(b.built.priorityFees),
                tips: per(b.built.mevTips),
                total: per(
                  b.built.baseFees + b.built.priorityFees + b.built.mevTips
                )
              }
            : null,
        understated: b.tips === 'ownTipAccounts',
        keptPerBlock:
          b.built?.kept != null && blocks ? b.built.kept / blocks : null,
        keptEstimated: !!b.built?.fees && !b.built.fees.measured,
        perBlockAfter: afterFees(b)
      };
    });
};

/** A builder's name, starred when its income is understated. */
const label = (r: Row_) =>
  `${r.b.name || r.b.builder}${r.understated ? '*' : ''}`;

/** Income per built block by builder, split base / priority / tips
 *  (SOL), most first. */
const IncomeChart = ({ rows, after }: { rows: Row_[]; after: boolean }) => {
  const { getThemeColor } = useAppContext();
  // Before or after the fees its blocks paid.
  const pb = (r: Row_) => (after ? r.perBlockAfter : r.perBlock);
  const shown = rows
    .filter(r => pb(r))
    .sort((a, b) => pb(a)!.total - pb(b)!.total);
  const parts = [
    { key: 'base', name: 'Base fees', color: getThemeColor('info') },
    {
      key: 'priority',
      name: 'Priority fees',
      color: getThemeColor('primary')
    },
    { key: 'tips', name: 'Jito tips', color: getThemeColor('success') }
  ] as const;
  const option = {
    animation: false,
    grid: { left: 4, right: 64, top: 28, bottom: 4, containLabel: true },
    legend: {
      top: 0,
      left: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: getThemeColor('tertiary-color'), fontSize: 11 }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      backgroundColor: getThemeColor('body-highlight-bg'),
      borderColor: getThemeColor('border-color'),
      textStyle: { color: getThemeColor('body-color') },
      formatter: (ps: Array<{ dataIndex: number }>) => {
        const r = shown[ps[0]?.dataIndex ?? 0];
        if (!r || !pb(r)) return '';
        const line = (c: string | null, k: string, v: string) =>
          `<div class="d-flex justify-content-between gap-3">${
            c
              ? `<span class="d-inline-block rounded-circle me-1 align-self-center" style="width:8px;height:8px;background:${c}"></span>`
              : ''
          }<span class="me-auto">${k}</span><span class="fw-semibold">${v}</span></div>`;
        return (
          `<div class="fw-bold mb-1">${r.b.name || r.b.builder}</div>` +
          parts.map(p => line(p.color, p.name, sol(pb(r)![p.key]))).join('') +
          line(
            null,
            after ? 'Average kept per block' : 'Average per block',
            sol(pb(r)!.total)
          ) +
          `<div class="fs-10 text-body-tertiary mt-1">${r.blocks.toLocaleString()} blocks built</div>` +
          (r.b.tips === 'priorityFees'
            ? `<div class="fs-10 text-body-tertiary" style="max-width:16rem;white-space:normal">Its own tips arrive as priority fees: Jito tips here are only the Jito bundles that landed in its blocks.</div>`
            : '') +
          (after && r.keptEstimated
            ? `<div class="fs-10 text-warning">After estimated fees (staging only).</div>`
            : '') +
          (r.understated
            ? `<div class="fs-10 text-body-tertiary" style="max-width:16rem;white-space:normal">Its tips go to its own tip accounts, not read yet: understated.</div>`
            : '')
        );
      }
    },
    xAxis: {
      type: 'value',
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        fontSize: 10,
        formatter: (v: number) => formatLamports(v, 3)
      },
      splitLine: { lineStyle: { color: getThemeColor('border-color') } }
    },
    yAxis: {
      type: 'category',
      data: shown.map(label),
      axisLabel: { color: getThemeColor('body-color'), fontSize: 11 },
      axisTick: { show: false }
    },
    series: parts.map((p, i) => ({
      name: p.name,
      type: 'bar',
      stack: 'income',
      barMaxWidth: 22,
      color: p.color,
      data: shown.map(r => pb(r)![p.key]),
      cursor: 'default',
      // The total at the end of the bar.
      ...(i === parts.length - 1
        ? {
            label: {
              show: true,
              position: 'right',
              color: getThemeColor('body-color'),
              fontSize: 11,
              formatter: ({ dataIndex }: { dataIndex: number }) =>
                sol(pb(shown[dataIndex])!.total)
            }
          }
        : {})
    }))
  };
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      style={{ height: 64 + shown.length * 34, width: '100%' }}
    />
  );
};

/** Each builder's share of the blocks built, most first, in its color
 *  (as Builders Over Time). */
const ShareChart = ({ rows }: { rows: Row_[] }) => {
  const { getThemeColor } = useAppContext();
  const shown = rows
    .filter(r => r.blockShare)
    .sort((a, b) => (a.blockShare ?? 0) - (b.blockShare ?? 0));
  const option = {
    animation: false,
    grid: { left: 4, right: 48, top: 8, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      backgroundColor: getThemeColor('body-highlight-bg'),
      borderColor: getThemeColor('border-color'),
      textStyle: { color: getThemeColor('body-color') },
      formatter: (ps: Array<{ dataIndex: number }>) => {
        const r = shown[ps[0]?.dataIndex ?? 0];
        if (!r) return '';
        return (
          `<div class="fw-bold mb-1">${r.b.name || r.b.builder}</div>` +
          `${pct(r.blockShare, 2)} of blocks built<div class="fs-10 text-body-tertiary">${r.blocks.toLocaleString()} blocks</div>`
        );
      }
    },
    xAxis: {
      type: 'value',
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        fontSize: 10,
        formatter: (v: number) => pct(v, 0)
      },
      splitLine: { lineStyle: { color: getThemeColor('border-color') } }
    },
    yAxis: {
      type: 'category',
      data: shown.map(r => r.b.name || r.b.builder),
      axisLabel: { color: getThemeColor('body-color'), fontSize: 11 },
      axisTick: { show: false }
    },
    series: [
      {
        name: 'Share of blocks built',
        type: 'bar',
        barMaxWidth: 22,
        cursor: 'default',
        data: shown.map(r => ({
          value: r.blockShare ?? 0,
          itemStyle: {
            color: builderColor(
              r.b.builder === 'none' ? 'other' : r.b.builder,
              getThemeColor
            )
          }
        })),
        label: {
          show: true,
          position: 'right',
          color: getThemeColor('tertiary-color'),
          fontSize: 10,
          formatter: ({ value }: { value: number }) => pct(value)
        }
      }
    ]
  };
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      style={{ height: 64 + shown.length * 34, width: '100%' }}
    />
  );
};

/** A fee's kind, its base and when it's taken, in words. */
const FEE_KIND: Record<string, string> = {
  builderCommission: 'Builder commission',
  tipRouterFee: 'Tip router fee',
  priorityFeeRouterFee: 'Priority fee router fee',
  tipCommission: 'Commission on its tips',
  blockFeeCommission: 'Commission on block fees',
  mevCommissionShare: 'Share of MEV commission'
};
const FEE_BASE: Record<string, string> = {
  jitoTips: 'Jito tips',
  sharedPriorityFees: 'priority fees shared through Jito',
  ownTips: 'its own tips',
  blockFees: 'block fees',
  validatorMevCommission: "validators' MEV commission"
};
const FEE_WHEN: Record<string, string> = {
  atDrain: 'at each tip payout',
  atDistribution: 'at tip distribution',
  perLeaderTurn: 'per leader turn',
  afterEpoch: 'after the epoch'
};

/** A small soft badge. */
const Tag = ({ tone, children }: { tone: string; children: string }) => (
  <span className={`badge badge-soft badge-soft-${tone} ms-1 fs-11`}>
    {children}
  </span>
);

/**
 * What each builder's operator collected in fees in the epoch, by
 * collector (Jito runs both Jito builders), each fee listed: its rate and
 * base, when it's taken, and how much - measured on chain, or an estimate
 * (rate x base; the staging API only) marked as one. Fees on bases Vortex
 * doesn't read are "not measured".
 */
const RevenueCard = ({ d }: { d: BlockBuilders }) => {
  // Collectors with a fee, or with a builder in the epoch (Harmonic: none
  // charged); not one nobody runs (Paladin today).
  const revenue = (d.builderRevenue ?? []).filter(
    c =>
      c.items.length > 0 ||
      c.builders.some(id =>
        d.builders.some(b => b.builder === id && b.validators > 0)
      )
  );
  const builderName = (id: string | null) =>
    id ? (d.builders.find(b => b.builder === id)?.name ?? id) : null;
  return (
    <SectionCard
      title="Builder Revenue"
      icon="briefcase"
      info="What each builder's operator collected in the epoch from the fees it charges, by who collects them (Jito runs both Jito builders). Measured: read on chain. Estimate: the fee's rate times what it's charged on. Not measured: charged on something Vortex doesn't read yet (Rakurai's and Raiku's own tips)."
    >
      {revenue.length === 0 ? (
        <UntrackedState>
          No builder fees from this API for the epoch.
        </UntrackedState>
      ) : (
        <Table responsive size="sm" className="data-table no-stripes fs-9 mb-0">
          <thead>
            <tr className="text-nowrap">
              <th>Collector / Fee</th>
              <th>Charged On</th>
              <th className="text-end">Rate</th>
              <th className="text-end">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {revenue.map(c => (
              <Fragment key={c.collector}>
                <tr className="bg-body-highlight">
                  <td className="fw-semibold">
                    {c.name || c.collector}
                    {c.builders.length > 0 && (
                      <span className="fw-normal text-body-tertiary fs-10 ms-2">
                        runs {c.builders.map(builderName).join(', ')}
                      </span>
                    )}
                  </td>
                  <td className="text-body-tertiary fs-10">
                    {c.items.length === 0 ? 'no fees' : ''}
                  </td>
                  <td />
                  <td className="text-end fw-semibold text-nowrap">
                    {!c.items.length ? (
                      '—'
                    ) : c.items.every(i => i.lamports == null) ? (
                      <span className="fw-normal text-body-tertiary">
                        not measured
                      </span>
                    ) : (
                      formatLamports(c.lamports, 2)
                    )}
                    {c.items.some(i => i.lamports != null && !i.measured) && (
                      <Tag tone="warning">incl. estimates</Tag>
                    )}
                    {c.items.some(i => i.lamports != null) && !c.complete && (
                      <Tag tone="secondary">not final</Tag>
                    )}
                  </td>
                </tr>
                {c.items.map((i, n) => (
                  <tr key={n}>
                    <td className="ps-4">
                      {i.source ? (
                        <a href={i.source} target="_blank" rel="noreferrer">
                          {FEE_KIND[i.kind] ?? i.kind}
                        </a>
                      ) : (
                        (FEE_KIND[i.kind] ?? i.kind)
                      )}
                      {i.when && (
                        <span className="text-body-tertiary fs-10 ms-2">
                          {FEE_WHEN[i.when] ?? i.when}
                        </span>
                      )}
                    </td>
                    <td>
                      {(i.base && FEE_BASE[i.base]) ?? i.base ?? '—'}
                      <span className="text-body-tertiary fs-10 ms-2">
                        {i.paidBy
                          ? `in ${builderName(i.paidBy)} blocks`
                          : 'every validator’s'}
                      </span>
                    </td>
                    <td className="text-end">{bps(i.rateBps)}</td>
                    <td className="text-end text-nowrap">
                      {i.lamports != null ? (
                        formatLamports(i.lamports, 2)
                      ) : (
                        <span className="text-body-tertiary">
                          {i.measured ? 'after the epoch' : 'not measured'}
                        </span>
                      )}
                      {i.lamports != null && !i.measured && (
                        <Tag tone="warning">estimate</Tag>
                      )}
                      {i.lamports != null && i.measured && !i.complete && (
                        <Tag tone="secondary">not final</Tag>
                      )}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </Table>
      )}
    </SectionCard>
  );
};

/** Epochs the over-time chart covers, the current one last. */
const OVER_TIME_EPOCHS = 10;

/** Builders' colors (No builder in gray). */
const builderColor = (
  builder: string,
  getThemeColor: (name: string) => string
) =>
  ({
    'jito-bam': getThemeColor('primary'),
    harmonic: 'rgb(26, 153, 131)',
    'jito-block-engine': getThemeColor('info'),
    rakurai: getThemeColor('warning'),
    raiku: getThemeColor('danger'),
    paladin: getThemeColor('success')
  })[builder] ?? getThemeColor('quaternary-color');

/**
 * Each builder's share over the last epochs, stacked to 100% (as the home
 * page's Client Diversity), of the blocks built: each block by the
 * client its leader ran then; epochs not labelled yet left out. No
 * builder on top, in gray; Unknown (client not read) left out.
 */
const OverTimeCard = ({ currentEpoch }: { currentEpoch: number }) => {
  const context = useContext(VortexDataContext);
  const { getThemeColor } = useAppContext();
  const slice = context?.blockBuildersState;
  const fetchData = slice?.fetchData;
  const epochs = useMemo(
    () =>
      Array.from(
        { length: OVER_TIME_EPOCHS },
        (_, i) => currentEpoch - OVER_TIME_EPOCHS + 1 + i
      ).filter(e => e >= FIRST_EPOCH),
    [currentEpoch]
  );
  useEffect(() => {
    epochs.forEach(e => fetchData?.(e));
  }, [epochs, fetchData]);
  const loaded = epochs
    .map(e => slice?.data.get(e))
    .filter((d): d is BlockBuilders => !!d);
  const points = loaded
    .map(d => {
      if (!d.blockLabels) return null;
      const total = d.builders.reduce((a, b) => a + (b.built?.blocks ?? 0), 0);
      const share = new Map<string, number>();
      for (const b of d.builders) {
        if (b.builder === UNKNOWN) continue;
        const key = b.builder === 'none' ? 'other' : b.builder;
        const v = b.built?.blocks ?? 0;
        share.set(key, (share.get(key) ?? 0) + (total ? v / total : 0));
      }
      return { epoch: d.epoch, inProgress: !d.complete, share };
    })
    .filter(p => p != null);
  const all = loaded.length === epochs.length;
  // The builders, most blocks in the latest epoch first; "other" on top.
  const last = loaded[loaded.length - 1];
  const names = new Map<string, string>(
    loaded.flatMap(d => d.builders.map(b => [b.builder, b.name] as const))
  );
  const keys = last
    ? [
        ...new Set(
          [...last.builders]
            .filter(b => b.builder !== 'none' && b.builder !== 'unknown')
            .sort((a, b) => (b.built?.blocks ?? 0) - (a.built?.blocks ?? 0))
            .map(b => b.builder)
        ),
        'other'
      ]
    : [];
  const nameOf = (k: string) =>
    k === 'other' ? 'No builder' : (names.get(k) ?? k);
  const latestPoint = points[points.length - 1];

  const option = {
    animation: false,
    // Room on the right for the last label ("1081 (now)").
    grid: { left: 4, right: 28, top: 8, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: getThemeColor('body-highlight-bg'),
      borderColor: getThemeColor('border-color'),
      textStyle: { color: getThemeColor('body-color'), fontSize: 12 },
      formatter: (ps: Array<{ dataIndex: number }>) => {
        const p = points[ps[0]?.dataIndex ?? 0];
        if (!p) return '';
        return (
          `<div class="fw-bold mb-1">Epoch ${p.epoch}${p.inProgress ? ' (so far)' : ''}</div>` +
          keys
            .filter(k => (p.share.get(k) ?? 0) > 0.0005)
            .map(
              k =>
                `<div class="d-flex justify-content-between gap-3"><span><span class="d-inline-block rounded-circle me-1" style="width:8px;height:8px;background:${builderColor(k, getThemeColor)}"></span>${nameOf(k)}</span><span class="fw-semibold">${pct(p.share.get(k) ?? 0)}</span></div>`
            )
            .join('')
        );
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map(p => `${p.epoch}${p.inProgress ? ' (now)' : ''}`),
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        fontSize: 10,
        interval: (i: number) => (points.length - 1 - i) % 2 === 0
      },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 1,
      interval: 0.25,
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        fontSize: 10,
        formatter: (v: number) => `${Math.round(v * 100)}%`
      },
      splitLine: { lineStyle: { color: getThemeColor('border-color') } }
    },
    series: keys.map(k => ({
      name: nameOf(k),
      type: 'line',
      stack: 'builders',
      symbol: 'none',
      smooth: 0.2,
      color: builderColor(k, getThemeColor),
      lineStyle: { width: 1 },
      areaStyle: { opacity: 0.55 },
      data: points.map(p => p.share.get(k) ?? 0)
    }))
  };

  return (
    <SectionCard
      title="Builders Over Time"
      icon="trending-up"
      info="Each builder's share of the blocks built, epoch by epoch ('now': the epoch in progress, so far): each block by the client its leader ran when it built it (a BAM validator's fallback blocks count under Block Engine). Epochs not labelled yet are left out."
    >
      <div className="d-flex flex-wrap column-gap-3 fs-10 text-body-tertiary mb-1">
        {keys.map(k => (
          <span key={k} className="d-inline-flex align-items-center gap-1">
            <span
              className="d-inline-block rounded-1"
              style={{
                width: 10,
                height: 10,
                background: builderColor(k, getThemeColor)
              }}
            />
            {nameOf(k)}
            {latestPoint ? ` ${pct(latestPoint.share.get(k) ?? 0)}` : ''}
          </span>
        ))}
      </div>
      {!all || points.length < 2 ? (
        <div style={{ height: 200 }}>
          {all ? (
            <UntrackedState>Not enough epochs labelled yet.</UntrackedState>
          ) : (
            <div className="placeholder-glow h-100">
              <span className="placeholder w-100 h-100 rounded bg-body-secondary" />
            </div>
          )}
        </div>
      ) : (
        <ReactEChartsCore
          echarts={echarts}
          option={option}
          notMerge
          style={{ height: 200, width: '100%' }}
        />
      )}
    </SectionCard>
  );
};

/**
 * Block builders (/cluster/block-builders): for one epoch, how each
 * builder's blocks paid the leader - base fees, priority fees and
 * tips per block built - and its share of the blocks built, to help
 * validators pick one. Blocks are credited by the
 * client the leader ran when it built them. Staging only for now.
 */
const BlockBuildersPage = () => {
  const context = useContext(VortexDataContext);
  const navigate = useNavigate();
  const { epoch: epochParam } = useParams();
  const currentEpoch = context?.currentEpochState.epoch ?? null;
  const parsed = epochParam ? Number.parseInt(epochParam) : NaN;
  const epoch = Number.isNaN(parsed) ? currentEpoch : parsed;

  const slice = context?.blockBuildersState;
  const fetchData = slice?.fetchData;
  useEffect(() => {
    if (epoch != null) fetchData?.(epoch);
  }, [epoch, fetchData]);
  const d = epoch != null ? slice?.data.get(epoch) : undefined;
  const failed = !d && !slice?.isLoading && !!slice?.error;
  const rows = useMemo(() => (d ? rowsOf(d) : []), [d]);
  const unknown = d?.builders.find(b => b.builder === UNKNOWN);
  // Kept per block: only where the API serves the blocks' fees (staging).
  const showKept = rows.some(r => r.keptPerBlock != null);
  // Average Income per Block: before or after builder fees (after, where
  // the API serves the blocks' fees).
  const [feesView, setFeesView] = useState<'before' | 'after'>('after');
  const after = showKept && feesView === 'after';

  const epochOptions = useMemo(() => {
    const out: Array<{ value: number; label: string }> = [];
    if (currentEpoch == null) return out;
    for (let e = currentEpoch; e >= FIRST_EPOCH; e--)
      out.push({
        value: e,
        label: `Epoch ${e}${e === currentEpoch ? ' (current)' : ''}`
      });
    return out;
  }, [currentEpoch]);
  const onEpoch = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = Number(e.target.value);
    navigate(
      v === currentEpoch ? '/block-builders' : `/block-builders/epoch/${v}`
    );
  };

  const labels = d?.blockLabels ?? null;
  // Builders proper: not "none" or "unknown".
  const real = rows.filter(
    r => r.b.builder !== 'none' && r.b.builder !== 'unknown'
  );
  const most = [...real].sort((a, b) => b.blocks - a.blocks)[0];
  // Highest income per block, among builders with income we read whole
  // and blocks enough to mean something.
  const best = [...real]
    .filter(r => r.perBlock && !r.understated && r.blocks >= 1000)
    .sort((a, b) => b.perBlock!.total - a.perBlock!.total)[0];
  const withBuilder = real.reduce((a, r) => a + r.b.validators, 0);
  const withBuilderStake = real.reduce((a, r) => a + (r.b.stakeShare ?? 0), 0);

  const header = (
    <div className="page-header row g-3 align-items-start justify-content-between">
      <div className="col">
        <h1 className="h3">Block Builders</h1>
        <p className="text-body-tertiary lh-sm mb-0 mt-1">
          How each block builder&apos;s blocks pay the leader: fees and tips per
          block built
        </p>
      </div>
      <Col xs={12} sm={4} md={3}>
        <Form.Select
          size="sm"
          value={epoch ?? ''}
          onChange={onEpoch}
          aria-label="Epoch"
        >
          {epochOptions.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Form.Select>
      </Col>
    </div>
  );

  if (failed)
    return (
      <div className="mb-9">
        {header}
        <UntrackedState>
          No block builder data for epoch {epoch} from this API.
        </UntrackedState>
      </div>
    );
  if (!d)
    return (
      <div className="mb-9">
        {header}
        <PageSkeleton rows={SKELETON.blockBuilders} />
      </div>
    );

  return (
    <div className="mb-9">
      {header}
      <div className="d-flex flex-column gap-3">
        <Row className="g-3">
          <Col xs={6} xl={3}>
            <StatCard
              label="Blocks Labelled"
              value={labels ? labels.blocks.toLocaleString() : '—'}
              sublabel={
                !labels
                  ? 'not labelled yet'
                  : labels.complete
                    ? `the whole epoch · ${labels.unplaced.toLocaleString()} unplaced`
                    : `through slot ${labels.throughSlot.toLocaleString('en-US')} · ${labels.unplaced.toLocaleString()} unplaced`
              }
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              label="Most Blocks"
              mono={false}
              value={most && labels ? most.b.name : '—'}
              sublabel={
                most && labels
                  ? `${pct(most.blockShare)} of blocks · ${pct(most.b.stakeShare)} of stake`
                  : undefined
              }
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              label="Top Avg Income / Block"
              mono={false}
              value={best ? best.b.name : '—'}
              sublabel={
                best
                  ? `${sol(best.perBlock!.total)} average per block built`
                  : undefined
              }
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              label="With a Builder"
              value={withBuilder.toLocaleString()}
              sublabel={`validators · ${pct(withBuilderStake)} of stake`}
            />
          </Col>
        </Row>

        {currentEpoch != null && <OverTimeCard currentEpoch={currentEpoch} />}

        {!labels ? (
          <SectionCard title="Average Income per Block" icon="dollar-sign">
            <UntrackedState>
              Epoch {d.epoch}&apos;s blocks aren&apos;t labelled by builder yet
              {d.epoch < FIRST_EPOCH ? '' : ' (labelling is catching up)'}.
            </UntrackedState>
          </SectionCard>
        ) : (
          <Row className="g-3">
            <Col xs={12} lg={7}>
              <SectionCard
                title="Average Income per Block"
                icon="dollar-sign"
                info="The average (mean) the leader took in per block it built - the builder's blocks' total over their count - by the builder whose client it ran at that block: its share of base fees, priority fees and Jito tips. Before fees: gross. After fees: less the fees those blocks paid (Jito's builder commission and tip router fee off the Jito tips, and so on; see Builder Revenue), before the validator's own MEV commission. * Tips paid to its own tip accounts, not read yet: understated."
                aside={
                  showKept ? (
                    <ButtonGroup size="sm">
                      {(
                        [
                          ['after', 'After fees'],
                          ['before', 'Before fees']
                        ] as const
                      ).map(([k, l]) => (
                        <ToggleButton
                          key={k}
                          id={`income-fees-${k}`}
                          type="radio"
                          name="income-fees"
                          variant="soft-secondary"
                          value={k}
                          checked={feesView === k}
                          onChange={() => setFeesView(k)}
                        >
                          {l}
                        </ToggleButton>
                      ))}
                    </ButtonGroup>
                  ) : undefined
                }
              >
                <IncomeChart rows={rows} after={after} />
              </SectionCard>
            </Col>
            <Col xs={12} lg={5}>
              <SectionCard
                title="Share of Blocks"
                icon="bar-chart-2"
                info="Each builder's share of the epoch's blocks built: each block by the client its leader ran when it built it (a BAM validator's fallback blocks count under Block Engine)."
              >
                <ShareChart rows={rows} />
              </SectionCard>
            </Col>
          </Row>
        )}

        {d.builderRevenue && <RevenueCard d={d} />}

        <SectionCard title="Builders" icon="layers">
          <Table responsive size="sm" className="data-table fs-9 mb-0">
            <thead>
              <tr className="text-nowrap">
                <th>Builder</th>
                <th className="text-end">Validators</th>
                <th className="text-end">Stake</th>
                <th className="text-end">Blocks Built</th>
                <th
                  className="text-end"
                  title="Average (mean) per block built: its blocks' total over their count"
                >
                  Avg / Block
                </th>
                {showKept && (
                  <th
                    className="text-end"
                    title="Average per block built after the fees those blocks paid (builder commissions; estimates are marked)"
                  >
                    Kept / Block
                  </th>
                )}
                <th className="text-end">Base</th>
                <th className="text-end">Priority</th>
                <th className="text-end">Jito Tips</th>
                <th
                  className="text-end"
                  title="The median MEV commission of its validators with a Jito tip account"
                >
                  MEV Commission
                </th>
                <th>Tips Paid Via</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.b.builder}>
                  <td>
                    <div className="fw-semibold">{label(r)}</div>
                    {r.b.clients.length > 0 && (
                      // One line, so the table's height doesn't follow it.
                      <div
                        className="fs-10 text-body-tertiary text-truncate"
                        style={{ maxWidth: '16rem' }}
                        title={r.b.clients.map(c => c.client).join(', ')}
                      >
                        {r.b.clients.map(c => c.client).join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="text-end">
                    {r.b.validators.toLocaleString()}
                  </td>
                  <td className="text-end">{pct(r.b.stakeShare, 2)}</td>
                  <td className="text-end">
                    {labels ? r.blocks.toLocaleString() : '—'}
                    {labels && r.blockShare != null && (
                      <div className="fs-10 text-body-tertiary">
                        {pct(r.blockShare, 2)}
                      </div>
                    )}
                  </td>
                  <td className="text-end fw-semibold">
                    {sol(r.perBlock?.total ?? null)}
                  </td>
                  {showKept && (
                    <td className="text-end">
                      {sol(r.keptPerBlock)}
                      {r.keptPerBlock != null && r.keptEstimated && (
                        <div className="fs-10 text-warning">estimate</div>
                      )}
                    </td>
                  )}
                  <td className="text-end">{sol(r.perBlock?.base ?? null)}</td>
                  <td className="text-end">
                    {sol(r.perBlock?.priority ?? null)}
                  </td>
                  <td className="text-end">{sol(r.perBlock?.tips ?? null)}</td>
                  <td className="text-end">{bps(r.b.mevCommissionBps)}</td>
                  <td className="text-nowrap">
                    {r.b.tips ? TIPS[r.b.tips] : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </SectionCard>

        <SectionCard title="Reading the Numbers" icon="info">
          <ul className="fs-9 text-body-secondary mb-0 ps-4 d-flex flex-column gap-1">
            <li>
              Jito tips are Jito bundles&apos; tips, which land in any
              builder&apos;s blocks. They don&apos;t compare across builders:
              Harmonic&apos;s own tips arrive as priority fees, so its Jito tips
              are only the Jito bundles that landed in its blocks. Compare the
              per-block total.
            </li>
            <li>
              Rakurai and Raiku (*) pay tips into their own tip accounts, which
              Vortex doesn&apos;t read yet: their income here is understated.
            </li>
            <li>
              Jito tips are gross: Jito&apos;s fee and the validator&apos;s MEV
              commission come out later, when the epoch&apos;s tips are
              distributed.
            </li>
            <li>
              A block counts for the builder whose client its leader ran when it
              built it, so a BAM validator&apos;s fallback blocks count under
              Block Engine; a block within a minute or so of a switch may land
              on the wrong side
              {labels?.unplaced
                ? `, and ${labels.unplaced.toLocaleString()} blocks couldn't be placed`
                : ''}
              . Validators and stake group each validator by the client it ran
              in the epoch.
            </li>
            {unknown && unknown.validators > 0 && (
              <li>
                Left out: {unknown.validators.toLocaleString()} validators (
                {pct(unknown.stakeShare, 2)} of stake) whose client
                couldn&apos;t be read for the epoch
                {unknown.built?.blocks
                  ? `, and ${unknown.built.blocks.toLocaleString()} blocks built on one`
                  : ''}
                .
              </li>
            )}
            {d.feeEstimates && (
              <li>
                Builder fees marked estimate are the fee&apos;s rate times what
                it&apos;s charged on, not read on chain; this staging API serves
                them, production won&apos;t. Kept / Block takes them off the
                average.
              </li>
            )}
            {!d.complete && (
              <li>
                Epoch {d.epoch} is in progress: these numbers grow as it goes.
              </li>
            )}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
};

export default BlockBuildersPage;
