import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
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
import { ChangeEvent, useContext, useEffect, useMemo } from 'react';
import { Col, Form, Row, Table } from 'react-bootstrap';
import { useNavigate, useParams } from 'react-router';

echarts.use([
  BarChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer
]);

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
};

const rowsOf = (d: BlockBuilders): Row_[] => {
  const labelled = d.blockLabels?.blocks ?? 0;
  return d.builders.map(b => {
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
      understated: b.tips === 'ownTipAccounts'
    };
  });
};

/** A builder's name, starred when its income is understated. */
const label = (r: Row_) =>
  `${r.b.name || r.b.builder}${r.understated ? '*' : ''}`;

/** Income per built block by builder, split base / priority / Jito tips
 *  (SOL), most first. */
const IncomeChart = ({ rows }: { rows: Row_[] }) => {
  const { getThemeColor } = useAppContext();
  const shown = rows
    .filter(r => r.perBlock)
    .sort((a, b) => a.perBlock!.total - b.perBlock!.total);
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
        if (!r?.perBlock) return '';
        const line = (c: string | null, k: string, v: string) =>
          `<div class="d-flex justify-content-between gap-3">${
            c
              ? `<span class="d-inline-block rounded-circle me-1 align-self-center" style="width:8px;height:8px;background:${c}"></span>`
              : ''
          }<span class="me-auto">${k}</span><span class="fw-semibold">${v}</span></div>`;
        return (
          `<div class="fw-bold mb-1">${r.b.name || r.b.builder}</div>` +
          parts
            .map(p => line(p.color, p.name, sol(r.perBlock![p.key])))
            .join('') +
          line(null, 'Per block', sol(r.perBlock.total)) +
          `<div class="fs-10 text-body-tertiary mt-1">${r.blocks.toLocaleString()} blocks built</div>` +
          (r.b.tips === 'priorityFees'
            ? `<div class="fs-10 text-body-tertiary" style="max-width:16rem;white-space:normal">Its tips are priority fees: Jito tips here are only the Jito bundles in its blocks.</div>`
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
      data: shown.map(r => r.perBlock![p.key]),
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
                sol(shown[dataIndex].perBlock!.total)
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

/** Each builder's share of the stake against its share of the blocks
 *  built, by stake. */
const ShareChart = ({ rows }: { rows: Row_[] }) => {
  const { getThemeColor } = useAppContext();
  const shown = rows
    .filter(r => r.b.stakeShare || r.blockShare)
    .sort((a, b) => (a.b.stakeShare ?? 0) - (b.b.stakeShare ?? 0));
  const series = [
    {
      name: 'Share of stake',
      color: getThemeColor('primary'),
      value: (r: Row_) => r.b.stakeShare ?? 0
    },
    {
      name: 'Share of blocks built',
      color: getThemeColor('info'),
      value: (r: Row_) => r.blockShare ?? 0
    }
  ];
  const option = {
    animation: false,
    grid: { left: 4, right: 48, top: 28, bottom: 4, containLabel: true },
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
      valueFormatter: (v: number) => pct(v, 2)
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
    series: series.map(s => ({
      name: s.name,
      type: 'bar',
      barMaxWidth: 12,
      color: s.color,
      cursor: 'default',
      data: shown.map(s.value),
      label: {
        show: true,
        position: 'right',
        color: getThemeColor('tertiary-color'),
        fontSize: 10,
        formatter: ({ value }: { value: number }) => pct(value)
      }
    }))
  };
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      style={{ height: 64 + shown.length * 40, width: '100%' }}
    />
  );
};

/**
 * Block builders (/cluster/block-builders): for one epoch, how each
 * builder's blocks paid the leader - base fees, priority fees and Jito
 * tips per block built - and its share of the blocks against its share
 * of the stake, to help validators pick one. Blocks are credited by the
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
          How each block builder&apos;s blocks pay the leader: fees and Jito
          tips per block built
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
              label="Top Income / Block"
              mono={false}
              value={best ? best.b.name : '—'}
              sublabel={
                best
                  ? `${sol(best.perBlock!.total)} per block built`
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

        {!labels ? (
          <SectionCard title="Income per Block" icon="dollar-sign">
            <UntrackedState>
              Epoch {d.epoch}&apos;s blocks aren&apos;t labelled by builder yet
              {d.epoch < FIRST_EPOCH ? '' : ' (labelling is catching up)'}.
            </UntrackedState>
          </SectionCard>
        ) : (
          <Row className="g-3">
            <Col xs={12} lg={7}>
              <SectionCard
                title="Income per Block"
                icon="dollar-sign"
                info="What the leader took in per block it built, by the builder whose client it ran at that block: its share of base fees, priority fees and Jito tips (gross, before Jito's fee and its MEV commission). * Tips paid to its own tip accounts, not read yet: understated."
              >
                <IncomeChart rows={rows} />
              </SectionCard>
            </Col>
            <Col xs={12} lg={5}>
              <SectionCard
                title="Blocks vs Stake"
                icon="bar-chart-2"
                info="Each builder's share of the stake (validators grouped by the client they ran in the epoch) against its share of the blocks built (each block by the client its leader ran then: a BAM validator's fallback blocks count under Block Engine)."
              >
                <ShareChart rows={rows} />
              </SectionCard>
            </Col>
          </Row>
        )}

        <SectionCard title="Builders" icon="layers">
          <Table responsive size="sm" className="data-table fs-9 mb-0">
            <thead>
              <tr className="text-nowrap">
                <th>Builder</th>
                <th className="text-end">Validators</th>
                <th className="text-end">Stake</th>
                <th className="text-end">Blocks Built</th>
                <th className="text-end">Per Block</th>
                <th className="text-end">Base</th>
                <th className="text-end">Priority</th>
                <th className="text-end">Jito Tips</th>
                <th
                  className="text-end"
                  title="The median MEV commission of its validators with a Jito tip account"
                >
                  MEV Commission
                </th>
                <th
                  className="text-end"
                  title="The builder's published fee on tips"
                >
                  Builder Fee
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
                  <td className="text-end">{sol(r.perBlock?.base ?? null)}</td>
                  <td className="text-end">
                    {sol(r.perBlock?.priority ?? null)}
                  </td>
                  <td className="text-end">{sol(r.perBlock?.tips ?? null)}</td>
                  <td className="text-end">{bps(r.b.mevCommissionBps)}</td>
                  <td
                    className="text-end"
                    title={r.b.protocolFee?.note ?? undefined}
                  >
                    {r.b.protocolFee?.source ? (
                      <a
                        href={r.b.protocolFee.source}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.b.protocolFee.bps != null
                          ? bps(r.b.protocolFee.bps)
                          : 'unpublished'}
                      </a>
                    ) : (
                      bps(r.b.protocolFee?.bps)
                    )}
                  </td>
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
              Jito tips don&apos;t compare across builders: Harmonic&apos;s tips
              arrive as priority fees, so its Jito tips are only the Jito
              bundles that landed in its blocks. Compare the per-block total.
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
