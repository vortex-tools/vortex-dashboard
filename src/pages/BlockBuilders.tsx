import { noPointer } from 'helpers/echart-utils';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import PageSkeleton, { SKELETON } from 'components/common/PageSkeleton';
import SectionCard from 'components/common/SectionCard';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import { formatLamports } from 'helpers/utils';
import { useAppContext } from 'providers/AppProvider';
import {
  BlockBuilder,
  BlockBuilders,
  blockBuilderSchema,
  blockBuildersSchema
} from 'providers/vortex-schemas';
import { API_ENDPOINT } from 'helpers/apiEndpoint';
import { z } from 'zod';
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
  MarkLineComponent,
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
    /** Tips in the builder's own tip accounts (Rakurai, Raiku), where
     *  measured. */
    own: number;
    total: number;
  } | null;
  /** Its tips go to its own accounts and aren't measured: income
   *  understated. */
  understated: boolean;
  /** Average per block after the fees its blocks paid (null: not all
   *  of them measured). */
  keptPerBlock: number | null;
  /** perBlock after the fees its blocks paid, each taken from the part
   *  it's charged on (null: no fees served). */
  perBlockAfter: Row_['perBlock'];
  /** perBlock is the median block's (the API serves the per-block
   *  distribution), not the mean. */
  median: boolean;
  /** The mean per block (its blocks' totals over their count). */
  mean: number | null;
  /** The middle half of its blocks' income: 25th to 75th percentile. */
  iqr: [number, number] | null;
};

/** A builder's per-block parts after the fees its blocks paid: Jito tip
 *  fees off the tips, shared priority fees' off priority fees, block-fee
 *  commissions off base and priority pro rata; fees on what income
 *  doesn't count (its own tips, the validator's MEV commission) don't. */
const afterFees = (b: BlockBuilder): Row_['perBlock'] => {
  const built = b.built;
  if (!built?.fees || !built.blocks) return null;
  const off = { base: 0, priority: 0, tips: 0, own: 0 };
  const fees = built.baseFees + built.priorityFees;
  for (const i of built.fees.items) {
    const l = i.lamports ?? 0;
    if (i.base === 'jitoTips') off.tips += l;
    else if (i.base === 'ownTips') off.own += l;
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
  const own = per((built.ownTips ?? 0) - off.own);
  return { base, priority, tips, own, total: base + priority + tips + own };
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
                own: per(b.built.ownTips ?? 0),
                total: per(
                  b.built.baseFees +
                    b.built.priorityFees +
                    b.built.mevTips +
                    (b.built.ownTips ?? 0)
                )
              }
            : null,
        understated: b.tips === 'ownTipAccounts' && b.built?.ownTips == null,
        keptPerBlock:
          b.built?.kept != null && blocks ? b.built.kept / blocks : null,
        perBlockAfter: afterFees(b),
        median: false,
        mean: null,
        iqr: null
      };
    })
    .map(r => {
      // The mean as computed above; with the per-block distribution, the
      // median block's parts instead (its kept: after the fees on its
      // Jito tips, taken off them).
      const mean = r.perBlock?.total ?? null;
      const q = r.b.built?.perBlock;
      if (!q) return { ...r, mean };
      const m = q.median;
      const fees = m.kept != null ? Math.max(0, m.total - m.kept) : null;
      return {
        ...r,
        // The per-block figures leave its own tips out (not per block).
        understated: r.b.tips === 'ownTipAccounts',
        median: true,
        mean,
        iqr: [q.p25.total, q.p75.total] as [number, number],
        perBlock: {
          base: m.baseFees,
          priority: m.priorityFees,
          tips: m.mevTips,
          own: 0,
          total: m.total
        },
        keptPerBlock: m.kept,
        perBlockAfter:
          fees != null
            ? {
                base: m.baseFees,
                priority: m.priorityFees,
                tips: Math.max(0, m.mevTips - fees),
                own: 0,
                total: m.kept!
              }
            : null
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
  // After the fees its blocks paid where they're served (the fees then a
  // last segment, so the whole bar is the gross), else before.
  const pb = (r: Row_) => (after ? r.perBlockAfter : r.perBlock);
  const feesOf = (r: Row_) =>
    after && r.perBlock && r.perBlockAfter
      ? Math.max(0, r.perBlock.total - r.perBlockAfter.total)
      : 0;
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
    { key: 'tips', name: 'Jito tips', color: getThemeColor('success') },
    { key: 'own', name: 'Own tips', color: getThemeColor('warning') }
  ]
    // Own tips only where some builder's are measured.
    .filter(
      p => p.key !== 'own' || shown.some(r => (pb(r)?.own ?? 0) > 0)
    ) as Array<{
    key: 'base' | 'priority' | 'tips' | 'own';
    name: string;
    color: string;
  }>;
  const feesColor = getThemeColor('quaternary-color');
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
          // Not the parts that are 0 (no Jito tips in its blocks, no fees).
          parts
            .filter(p => pb(r)![p.key] > 0)
            .map(p => line(p.color, p.name, sol(pb(r)![p.key])))
            .join('') +
          (after
            ? (feesOf(r) > 0
                ? line(feesColor, 'Builder fees', sol(feesOf(r)))
                : '') +
              line(null, 'Kept per block', sol(pb(r)!.total)) +
              line(null, 'Before fees', sol(r.perBlock?.total ?? null))
            : line(
                null,
                r.median ? 'Median per block' : 'Average per block',
                sol(pb(r)!.total)
              )) +
          (r.median
            ? `<div class="fs-10 text-body-tertiary mt-1" style="max-width:16rem;white-space:normal">The median block's parts. Middle half of its blocks: ${sol(r.iqr![0])} to ${sol(r.iqr![1])} · mean ${sol(r.mean)}</div>`
            : '') +
          `<div class="fs-10 text-body-tertiary mt-1">${r.blocks.toLocaleString()} blocks built</div>` +
          (r.b.tips === 'priorityFees'
            ? `<div class="fs-10 text-body-tertiary" style="max-width:16rem;white-space:normal">Its own tips arrive as priority fees: Jito tips here are only the Jito bundles that landed in its blocks.</div>`
            : '') +
          (r.understated
            ? `<div class="fs-10 text-body-tertiary" style="max-width:16rem;white-space:normal">Its own tips aren't measured for this epoch: understated.</div>`
            : '')
        );
      }
    },
    xAxis: {
      type: 'value',
      // Few enough ticks for a phone's width ("◎0.005" is wide), and no
      // label drawn over another.
      splitNumber: 4,
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        fontSize: 10,
        hideOverlap: true,
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
    series: [
      ...parts.map(p => ({ ...p, value: (r: Row_) => pb(r)![p.key] })),
      ...(after
        ? [
            {
              key: 'fees',
              name: 'Builder fees',
              color: feesColor,
              value: feesOf
            }
          ]
        : [])
    ].map((p, i, all) => ({
      name: p.name,
      type: 'bar',
      stack: 'income',
      barMaxWidth: 22,
      color: p.color,
      data: shown.map(p.value),
      cursor: 'default',
      // The average kept (or, without fees, the total) at the end.
      ...(i === all.length - 1
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
      option={noPointer(option)}
      notMerge
      style={{ height: 64 + shown.length * 34, width: '100%' }}
    />
  );
};

/** Each builder's share of the blocks built, most first, in its color
 *  (as Block Builder Distribution). */
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
      option={noPointer(option)}
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
  blockRewardCommission: 'Commission on block rewards',
  mevCommissionShare: 'Share of MEV commission'
};
const FEE_BASE: Record<string, string> = {
  jitoTips: 'Jito tips',
  sharedPriorityFees: 'priority fees shared through Jito',
  ownTips: 'its own tips',
  blockFees: 'block fees',
  sharedBlockRewards: 'block rewards it shares',
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
 * base, when it's taken, and how much, measured on chain (an estimate the
 * staging API serves is dropped: "not measured", as fees on what Vortex
 * doesn't read).
 */
type Collector = NonNullable<BlockBuilders['builderRevenue']>[number];

/** Jito's revenue as three rows: Jito BAM (the builder commission in BAM
 *  blocks), Jito Block Engine (the builder commission in every other
 *  block: the Block Engine's, and Rakurai's and stock clients' that pass
 *  its bundles on) and Jito's tip router (its protocol fees on every
 *  validator's Jito tips and shared priority fees, whatever built the
 *  block). Other collectors as they are. */
const splitJito = (c: Collector): Collector[] => {
  if (c.collector !== 'jito') return [c];
  const row = (
    collector: string,
    name: string,
    builders: string[],
    items: Collector['items']
  ): Collector => ({
    ...c,
    collector,
    name,
    builders,
    items,
    lamports: items.reduce((a, i) => a + (i.lamports ?? 0), 0),
    complete: items.every(i => i.complete && i.lamports != null)
  });
  const bam = c.items.filter(i => i.paidBy === 'jito-bam');
  const router = c.items.filter(i => i.paidBy == null);
  const engine = c.items.filter(i => !bam.includes(i) && !router.includes(i));
  return [
    row('jito-bam', 'Jito BAM', ['jito-bam'], bam),
    row(
      'jito-block-engine',
      'Jito Block Engine',
      ['jito-block-engine'],
      engine
    ),
    row('jito-tip-router', 'Jito tip router', [], router)
  ].filter(r => r.items.length > 0);
};

const RevenueCard = ({ d }: { d: BlockBuilders }) => {
  // Collectors with a fee, or with a builder in the epoch (Harmonic: none
  // charged); not one nobody runs (Paladin today).
  const revenue = (d.builderRevenue ?? [])
    .filter(
      c =>
        c.items.length > 0 ||
        c.builders.some(id =>
          d.builders.some(b => b.builder === id && b.validators > 0)
        )
    )
    .flatMap(splitJito);
  const builderName = (id: string | null) =>
    id ? (d.builders.find(b => b.builder === id)?.name ?? id) : null;
  return (
    <SectionCard
      title="Builder Revenue"
      icon="briefcase"
      info="What each builder's operator collected in the epoch from the fees it charges, by who collects them: Jito BAM and Jito Block Engine each their builder commission (the Block Engine's includes the blocks of clients that pass its bundles on, Rakurai's among them), and Jito's tip router its fees on every validator's Jito tips, whatever built the block. Every amount is read on chain. Not measured: not read for the epoch yet (Jito's builder commission is measured from epoch 1083). After the epoch: Jito's fees are known once it pays the epoch's tips out."
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
                    {c.collector === 'jito-tip-router' ? (
                      <span className="fw-normal text-body-tertiary fs-10 ms-2">
                        Jito&apos;s protocol fees, whatever built the block
                      </span>
                    ) : (
                      // Not "Jito BAM runs Jito BAM".
                      c.builders.some(id => builderName(id) !== c.name) && (
                        <span className="fw-normal text-body-tertiary fs-10 ms-2">
                          runs {c.builders.map(builderName).join(', ')}
                        </span>
                      )
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

/** Epochs the distribution chart covers at most, the current one last
 *  (every labelled epoch, from FIRST_EPOCH, until there are more). */
const OVER_TIME_EPOCHS = 30;

// The per-epoch charts' series: finished epochs from one long-cached
// /cluster/block-builders/history request, the epoch in progress from the
// page's own /cluster/block-builders (the slice). An API without the
// history route (404): every epoch from the slice, one request each.
const historySchema = z.object({
  epochs: z.array(
    z.object({
      epoch: z.number(),
      complete: z.boolean().catch(true),
      blockLabels: blockBuildersSchema.shape.blockLabels,
      builders: z.array(
        z.object({
          builder: z.string(),
          name: z.string().catch(''),
          built: blockBuilderSchema.shape.built
        })
      )
    })
  )
});
const historyCache = new Map<number, Promise<BlockBuilders[]>>();
const loadHistory = (toEpoch: number) => {
  let p = historyCache.get(toEpoch);
  if (!p) {
    p = fetch(
      `${API_ENDPOINT}/cluster/block-builders/history?fromEpoch=${FIRST_EPOCH}&toEpoch=${toEpoch}`
    )
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(j =>
        historySchema.parse(j).epochs.map(
          e =>
            ({
              epoch: e.epoch,
              complete: e.complete,
              validators: 0,
              stake: 0,
              leaderSlots: 0,
              blockLabels: e.blockLabels,
              builders: e.builders.map(b => ({
                builder: b.builder,
                name: b.name,
                tips: null,
                protocolFee: null,
                clients: [],
                validators: 0,
                stake: 0,
                stakeShare: null,
                leaderSlots: 0,
                slotShare: null,
                mevCommissionBps: null,
                built: b.built
              }))
            }) as BlockBuilders
        )
      );
    p.catch(() => historyCache.delete(toEpoch));
    historyCache.set(toEpoch, p);
  }
  return p;
};
/** The API's per-block quantiles are 2^(1/8)-wide histogram buckets'
 *  mean blocks: within about this share of the true value. */
const BUCKET_PRECISION = 0.045;

const useEpochSeries = (currentEpoch: number) => {
  const context = useContext(VortexDataContext);
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
  const [past, setPast] = useState<BlockBuilders[] | 'none' | null>(null);
  useEffect(() => {
    let alive = true;
    loadHistory(currentEpoch - 1).then(
      h => alive && setPast(h),
      () => alive && setPast('none')
    );
    return () => {
      alive = false;
    };
  }, [currentEpoch]);
  // The epoch in progress always from the slice; every epoch from it
  // when the API has no history route.
  useEffect(() => {
    fetchData?.(currentEpoch);
    if (past === 'none') epochs.forEach(e => fetchData?.(e));
  }, [past, epochs, currentEpoch, fetchData]);
  const byEpoch = new Map<number, BlockBuilders>();
  if (Array.isArray(past)) for (const d of past) byEpoch.set(d.epoch, d);
  const fromSlice = (e: number) => slice?.data.get(e);
  const loaded = epochs
    .map(e =>
      e === currentEpoch ? fromSlice(e) : (byEpoch.get(e) ?? fromSlice(e))
    )
    .filter((d): d is BlockBuilders => !!d);
  const done =
    past !== null &&
    epochs.every(
      e => (e !== currentEpoch && byEpoch.has(e)) || !!slice?.data.has(e)
    );
  return { epochs, loaded, done };
};

/** Builders' colors (No builder in gray). */
const builderColor = (
  builder: string,
  getThemeColor: (name: string) => string
) =>
  ({
    // Fixed, not the theme's primary: staging's orange (and testnet's
    // pink) would clash with Rakurai's.
    'jito-bam': '#7f3fff',
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
  const { getThemeColor } = useAppContext();
  const { loaded, done } = useEpochSeries(currentEpoch);
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
  const all = done;
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
      title="Block Builder Distribution"
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
          option={noPointer(option)}
          notMerge
          style={{ height: 200, width: '100%' }}
        />
      )}
    </SectionCard>
  );
};

/**
 * Average income per block built, epoch by epoch, one line per builder
 * (the epoch in progress so far): base, priority fees and Jito tips over
 * its blocks, and - dashed, where the API serves the blocks' fees - what
 * the leader kept after them. Epochs not labelled yet are left out.
 */
const IncomeHistoryCard = ({ currentEpoch }: { currentEpoch: number }) => {
  const { getThemeColor } = useAppContext();
  // (The same series as the distribution card: one history request.)
  const series = useEpochSeries(currentEpoch);
  const loaded = series.loaded.filter(d => !!d.blockLabels);
  const all = series.done && loaded.length >= 2;
  const last = loaded[loaded.length - 1];
  const names = new Map<string, string>(
    loaded.flatMap(d =>
      d.builders.map(
        b => [b.builder, b.builder === 'none' ? 'No builder' : b.name] as const
      )
    )
  );
  // Builders by the latest epoch's blocks, No builder last; not Unknown.
  const keys = last
    ? [...last.builders]
        .filter(b => b.builder !== UNKNOWN && (b.built?.blocks ?? 0) > 0)
        .sort(
          (a, b) =>
            (a.builder === 'none' ? 1 : 0) - (b.builder === 'none' ? 1 : 0) ||
            (b.built?.blocks ?? 0) - (a.built?.blocks ?? 0)
        )
        .map(b => b.builder)
    : [];
  // Medians once every epoch shown has the per-block distribution (not a
  // line mixing medians and means while the API fills it in).
  const useMedian =
    loaded.length > 0 &&
    loaded.every(d =>
      d.builders.every(b => !b.built?.blocks || !!b.built.perBlock)
    );
  const at = (d: BlockBuilders, k: string) => {
    const b = d.builders.find(x => x.builder === k)?.built;
    if (!b?.blocks) return { avg: null, kept: null };
    if (useMedian && b.perBlock)
      return { avg: b.perBlock.median.total, kept: b.perBlock.median.kept };
    return {
      avg:
        (b.baseFees + b.priorityFees + b.mevTips + (b.ownTips ?? 0)) / b.blocks,
      kept: b.kept != null ? b.kept / b.blocks : null
    };
  };
  // How far each median could be off: the boxplot notch for its number of
  // blocks, 1.58 x (p75 - p25) / sqrt(blocks) (a ~95% interval: narrow
  // with tens of thousands of blocks, wide with a few hundred), combined
  // with the API's precision (its quantiles are histogram buckets, within
  // ~4.5%).
  const band = (d: BlockBuilders, k: string): [number, number] | null => {
    const b = d.builders.find(x => x.builder === k)?.built;
    const q = b?.perBlock;
    if (!useMedian || !q || !b?.blocks) return null;
    const notch = (1.58 * (q.p75.total - q.p25.total)) / Math.sqrt(b.blocks);
    const half = Math.hypot(notch, BUCKET_PRECISION * q.median.total);
    return [Math.max(0, q.median.total - half), q.median.total + half];
  };
  const anyKept = loaded.some(d => d.builders.some(b => b.built?.kept != null));
  const color = (k: string) =>
    builderColor(k === 'none' ? 'other' : k, getThemeColor);
  // Relative (the default): each value over the epoch's baseline - its
  // builders' per-block figures weighted by their blocks, a typical block
  // that epoch - so what moves every builder together (a busy epoch)
  // drops out and 1x is the epoch's typical block. Absolute: SOL.
  const [scale, setScale] = useState<'relative' | 'absolute'>('relative');
  // A builder picked in the legend: its band shows and the other lines
  // fade (null: just the lines - bands for all were too busy).
  const [focus, setFocus] = useState<string | null>(null);
  const relative = scale === 'relative';
  const baselineOf = (d: BlockBuilders) => {
    let w = 0;
    let sum = 0;
    for (const b of d.builders) {
      if (b.builder === UNKNOWN || !b.built?.blocks) continue;
      const v = at(d, b.builder).avg;
      if (v == null) continue;
      w += b.built.blocks;
      sum += v * b.built.blocks;
    }
    return w ? sum / w : null;
  };
  const baselines = loaded.map(baselineOf);
  const norm = (v: number | null, i: number) =>
    v == null ? null : relative ? (baselines[i] ? v / baselines[i]! : null) : v;
  const fmtRel = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)}×`);
  const option = {
    animation: false,
    grid: { left: 4, right: 28, top: 8, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: getThemeColor('body-highlight-bg'),
      borderColor: getThemeColor('border-color'),
      textStyle: { color: getThemeColor('body-color'), fontSize: 12 },
      formatter: (ps: Array<{ dataIndex: number }>) => {
        const i = ps[0]?.dataIndex ?? 0;
        const d = loaded[i];
        if (!d) return '';
        const base = baselines[i];
        const rows = keys
          .map(k => {
            const r = band(d, k);
            const v = at(d, k);
            return {
              k,
              ...v,
              // The likely range's half-width, as a share of the median.
              pm: r && v.avg ? (r[1] - r[0]) / 2 / v.avg : null,
              n: d.builders.find(x => x.builder === k)?.built?.blocks ?? 0
            };
          })
          .filter(r => r.avg != null)
          .sort((a, b) => b.avg! - a.avg!);
        return (
          `<div class="fw-bold mb-1">Epoch ${d.epoch}${d.complete ? '' : ' (so far)'}</div>` +
          `<table class="fs-10"><tr class="text-body-tertiary"><td></td><td class="text-end ps-3">vs typical</td><td class="text-end ps-3">${useMedian ? 'Median' : 'Avg'} / block</td>${useMedian ? '<td class="text-end ps-2">±</td><td class="text-end ps-3">blocks</td>' : ''}${anyKept ? '<td class="text-end ps-3">Kept</td>' : ''}</tr>` +
          rows
            .map(
              r =>
                `<tr><td><span class="d-inline-block rounded-circle me-1" style="width:8px;height:8px;background:${color(r.k)}"></span>${names.get(r.k) ?? r.k}</td><td class="text-end ps-3 fw-semibold">${base ? fmtRel(r.avg! / base) : '—'}</td><td class="text-end ps-3">${sol(r.avg)}</td>${useMedian ? `<td class="text-end ps-2 text-body-tertiary">${r.pm != null ? `${Math.round(r.pm * 100)}%` : '—'}</td><td class="text-end ps-3 text-body-tertiary">${r.n.toLocaleString()}</td>` : ''}${anyKept ? `<td class="text-end ps-3">${r.kept != null ? sol(r.kept) : '—'}</td>` : ''}</tr>`
            )
            .join('') +
          '</table>' +
          (base
            ? `<div class="fs-10 text-body-tertiary mt-1">Typical block this epoch: ${sol(base)}</div>`
            : '')
        );
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: loaded.map(d => `${d.epoch}${d.complete ? '' : ' (now)'}`),
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        fontSize: 10,
        interval: (i: number) => (loaded.length - 1 - i) % 2 === 0
      },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        fontSize: 10,
        formatter: (v: number) =>
          relative ? `${v.toFixed(1)}×` : formatLamports(v, 3)
      },
      splitLine: { lineStyle: { color: getThemeColor('border-color') } }
    },
    series: [
      // Each median's likely range: an invisible lower edge, then the
      // band's height stacked on it, in the builder's color.
      ...(useMedian && focus && keys.includes(focus)
        ? [focus].flatMap(k => [
            {
              name: `${names.get(k) ?? k} (range low)`,
              type: 'line',
              stack: `band-${k}`,
              symbol: 'none',
              silent: true,
              lineStyle: { opacity: 0 },
              data: loaded.map((d, i) => norm(band(d, k)?.[0] ?? null, i))
            },
            {
              name: `${names.get(k) ?? k} (range)`,
              type: 'line',
              stack: `band-${k}`,
              symbol: 'none',
              silent: true,
              lineStyle: { opacity: 0 },
              areaStyle: { color: color(k), opacity: 0.18 },
              data: loaded.map((d, i) => {
                const r = band(d, k);
                const lo = norm(r?.[0] ?? null, i);
                const hi = norm(r?.[1] ?? null, i);
                return lo != null && hi != null ? hi - lo : null;
              })
            }
          ])
        : []),
      ...keys.map(k => ({
        name: names.get(k) ?? k,
        type: 'line',
        symbol: 'circle',
        symbolSize: 4,
        color: color(k),
        lineStyle: { width: 2, opacity: focus && focus !== k ? 0.2 : 1 },
        itemStyle: { opacity: focus && focus !== k ? 0.2 : 1 },
        data: loaded.map((d, i) => norm(at(d, k).avg, i)),
        z: 3,
        // 1x: the epoch's typical block.
        ...(relative && k === keys[0]
          ? {
              markLine: {
                silent: true,
                symbol: 'none',
                label: { show: false },
                lineStyle: {
                  color: getThemeColor('tertiary-color'),
                  type: 'dashed',
                  width: 1
                },
                data: [{ yAxis: 1 }]
              }
            }
          : {})
      })),
      ...(anyKept
        ? keys.map(k => ({
            name: `${names.get(k) ?? k} (kept)`,
            type: 'line',
            symbol: 'none',
            color: color(k),
            lineStyle: {
              width: 1,
              type: 'dashed',
              opacity: focus && focus !== k ? 0.15 : 0.8
            },
            data: loaded.map((d, i) => norm(at(d, k).kept, i))
          }))
        : [])
    ]
  };
  return (
    <SectionCard
      title={`${useMedian ? 'Median' : 'Average'} Income per Block by Epoch`}
      icon="trending-up"
      aside={
        <ButtonGroup size="sm">
          {(
            [
              ['relative', 'Relative'],
              ['absolute', 'SOL']
            ] as const
          ).map(([k, l]) => (
            <ToggleButton
              key={k}
              id={`income-history-${k}`}
              type="radio"
              name="income-history"
              variant="soft-secondary"
              value={k}
              checked={scale === k}
              onChange={() => setScale(k)}
            >
              {l}
            </ToggleButton>
          ))}
        </ButtonGroup>
      }
      info={`${useMedian ? "Click a builder in the legend for its band: how far its median could be off with its number of blocks (a ~95% range: median ± 1.58 × middle-half width / √blocks, combined with the API's ~4.5% precision) - narrow for builders with many blocks, wide for few; lines whose bands overlap aren't clearly different. " : ''}${relative ? "Relative: each builder against the epoch's typical block (1x, dashed) - its builders' figures weighted by their blocks - so what lifts every builder together drops out. SOL: the figures themselves. " : ''}Each builder's ${useMedian ? 'median income per block built (half its blocks paid more, half less)' : 'average (mean) income per block built'}, epoch by epoch ('now': the epoch in progress, so far): base fees, priority fees, Jito tips and (where measured) a builder's own tips over its blocks, by the client the leader ran at each block.${anyKept ? " Dashed: what the leader kept after the builder fees those blocks paid, for epochs whose fees are all measured (from 1083, when Jito's builder commission is)." : ''}`}
    >
      <div className="d-flex flex-wrap column-gap-3 fs-10 text-body-tertiary mb-1">
        {keys.map(k => (
          <button
            key={k}
            type="button"
            className={`btn btn-link p-0 fs-10 text-decoration-none d-inline-flex align-items-center gap-1 ${
              focus && focus !== k
                ? 'text-body-quaternary'
                : 'text-body-tertiary'
            }`}
            aria-pressed={focus === k}
            title={
              focus === k
                ? 'Show every builder'
                : useMedian
                  ? 'Show its median’s likely range'
                  : 'Highlight it'
            }
            onClick={() => setFocus(f => (f === k ? null : k))}
          >
            <span
              className="d-inline-block rounded-1"
              style={{ width: 10, height: 10, background: color(k) }}
            />
            <span className={focus === k ? 'fw-bold' : ''}>
              {names.get(k) ?? k}
            </span>
          </button>
        ))}
        {anyKept && (
          <span className="d-inline-flex align-items-center gap-1">
            <span
              className="d-inline-block"
              style={{
                width: 14,
                borderTop: `2px dashed ${getThemeColor('tertiary-color')}`
              }}
            />
            kept, after builder fees
          </span>
        )}
      </div>
      {!all ? (
        <div style={{ height: 260 }}>
          <div className="placeholder-glow h-100">
            <span className="placeholder w-100 h-100 rounded bg-body-secondary" />
          </div>
        </div>
      ) : (
        <ReactEChartsCore
          echarts={echarts}
          option={noPointer(option)}
          notMerge
          style={{ height: 260, width: '100%' }}
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
  // Median rather than mean per block where the API serves the per-block
  // distribution.
  const byMedian = rows.some(r => r.median);
  // Own Tips: a column once any builder's are measured.
  const showOwn = rows.some(r => r.b.built?.ownTips != null);
  // Kept per block: only where the API serves the blocks' fees (staging).
  const showKept = rows.some(r => r.keptPerBlock != null);
  // Average Income per Block: after builder fees, the fees a segment of
  // their own, where the API serves the blocks' fees.
  const after = showKept;

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
              label={byMedian ? 'Top Median / Block' : 'Top Avg Income / Block'}
              mono={false}
              value={best ? best.b.name : '—'}
              sublabel={
                best
                  ? `${sol(best.perBlock!.total)} ${byMedian ? 'median' : 'average'} per block built`
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
                title={`${byMedian ? 'Median' : 'Average'} Income per Block`}
                icon="dollar-sign"
                info={`${byMedian ? "The median block's income - half its builder's blocks paid the leader more, half less - and that block's parts (the mean, pulled up by a few large-tip blocks, and the middle half's range are in the tooltip)" : "The average (mean) the leader took in per block it built - the builder's blocks' total over their count -"} by the builder whose client it ran at that block: its share of base fees, priority fees, Jito tips and its builder's own tips (Rakurai's, Raiku's, where measured). Builder fees (gray, at the end): what those blocks paid in fees (Jito's builder commission and tip router fee off the Jito tips, and so on; see Builder Revenue), taken off the part they're charged on: the bar is the gross, the label what the leader kept, before its own MEV commission. * Own tips not measured for the epoch: understated.`}
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

        {currentEpoch != null && (
          <IncomeHistoryCard currentEpoch={currentEpoch} />
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
                  title={
                    byMedian
                      ? 'The median block: half its blocks paid more, half less'
                      : "Average (mean) per block built: its blocks' total over their count"
                  }
                >
                  {byMedian ? 'Median / Block' : 'Avg / Block'}
                </th>
                {byMedian && (
                  <th
                    className="text-end"
                    title="Average (mean) per block built: its blocks' total over their count"
                  >
                    Mean / Block
                  </th>
                )}
                {showKept && (
                  <th
                    className="text-end"
                    title="Average per block built after the fees those blocks paid (builder commissions; only where every fee is measured)"
                  >
                    Kept / Block
                  </th>
                )}
                <th className="text-end">Base</th>
                <th className="text-end">Priority</th>
                <th className="text-end">Jito Tips</th>
                {showOwn && <th className="text-end">Own Tips</th>}
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
                  {byMedian && <td className="text-end">{sol(r.mean)}</td>}
                  {showKept && (
                    <td className="text-end">{sol(r.keptPerBlock)}</td>
                  )}
                  <td className="text-end">{sol(r.perBlock?.base ?? null)}</td>
                  <td className="text-end">
                    {sol(r.perBlock?.priority ?? null)}
                  </td>
                  <td className="text-end">{sol(r.perBlock?.tips ?? null)}</td>
                  {showOwn && (
                    <td className="text-end">
                      {r.b.tips === 'ownTipAccounts'
                        ? r.b.built?.ownTips != null
                          ? sol(r.perBlock?.own ?? null)
                          : 'not measured'
                        : '—'}
                    </td>
                  )}
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
              Rakurai and Raiku pay tips into their own tip accounts: Own tips,
              where Vortex has measured them. A builder marked * has own tips
              not measured for the epoch, so its income here is understated.
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
