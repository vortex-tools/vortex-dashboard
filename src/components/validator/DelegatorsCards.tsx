import { directedDetail, holderDirected } from 'components/pools/directed';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import Pager from 'components/common/Pager';
import SectionCard from 'components/common/SectionCard';
import { StakerName } from 'components/validator/StakeChangesCards';
import { useAppContext } from 'providers/AppProvider';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { ValidatorDelegators } from 'providers/vortex-schemas';
import { useContext, useEffect, useState } from 'react';
import { ButtonGroup, Table, ToggleButton } from 'react-bootstrap';

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

const PAGE = 10;

const sol = (lamports: number) =>
  `◎${(lamports / 1e9).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
/** 1000 -> "1k", 1e6 -> "1M". */
const compact = (n: number) =>
  n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}k` : String(n);
const bucketLabel = (b: ValidatorDelegators['sizes'][number]) =>
  b.maxSol == null
    ? `≥${compact(b.minSol)}`
    : b.minSol === 0
      ? `<${compact(b.maxSol)}`
      : `${compact(b.minSol)}–${compact(b.maxSol)}`;

/**
 * Its delegators' stake sizes: per size bucket (by delegator, in SOL),
 * how many stakers or how much of the stake.
 */
const StakeSizes = ({ d }: { d: ValidatorDelegators }) => {
  const { getThemeColor } = useAppContext();
  const [by, setBy] = useState<'stake' | 'stakers'>('stake');
  const stake = by === 'stake';
  const option = {
    color: [getThemeColor('primary')],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: getThemeColor('body-highlight-bg'),
      borderColor: getThemeColor('border-color'),
      textStyle: { color: getThemeColor('body-color') },
      formatter: (ps: { dataIndex: number }[]) => {
        const b = d.sizes[ps[0].dataIndex];
        return `${bucketLabel(b)} SOL<br/>${b.delegators.toLocaleString()} stakers · ${sol(b.stake)} (${((b.stake / (d.stake || 1)) * 100).toFixed(1)}%)`;
      }
    },
    grid: { left: 4, right: 4, top: 20, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category',
      data: d.sizes.map(bucketLabel),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: getThemeColor('border-color') } },
      // Every bucket named.
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        interval: 0,
        fontSize: 10
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: getThemeColor('tertiary-color'),
        formatter: (v: number) => (stake ? `${Math.round(v * 100)}%` : v)
      },
      splitLine: { lineStyle: { color: getThemeColor('border-color') } }
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 36,
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        label: {
          show: true,
          position: 'top',
          color: getThemeColor('body-color'),
          fontSize: 11,
          formatter: (p: { value: number }) =>
            stake
              ? `${(p.value * 100).toFixed(p.value < 0.1 ? 1 : 0)}%`
              : p.value.toLocaleString()
        },
        data: d.sizes.map(b =>
          stake ? (d.stake ? b.stake / d.stake : 0) : b.delegators
        )
      }
    ],
    animation: false
  };
  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-1">
        <span className="fs-10 text-body-tertiary">
          Stakers by their stake here, in SOL
        </span>
        <ButtonGroup size="sm">
          {(['stake', 'stakers'] as const).map(v => (
            <ToggleButton
              key={v}
              id={`stake-sizes-${v}`}
              type="radio"
              name="stake-sizes"
              variant="soft-secondary"
              value={v}
              checked={by === v}
              onChange={() => setBy(v)}
            >
              {v === 'stake' ? 'Share of stake' : 'Stakers'}
            </ToggleButton>
          ))}
        </ButtonGroup>
      </div>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        notMerge
        style={{ height: 260, width: '100%' }}
      />
    </div>
  );
};

/** Its largest stakers, by withdraw authority (a pool is one). */
const TopStakers = ({
  d,
  top
}: {
  d: ValidatorDelegators;
  /** The rows to list (all of d.top, or only the pools). */
  top: ValidatorDelegators['top'];
}) => {
  const [page, setPage] = useState(0);
  const pages = Math.ceil(top.length / PAGE);
  const shown = top.slice(page * PAGE, (page + 1) * PAGE);
  return (
    <>
      <Table responsive size="sm" className="data-table fs-9 mb-0">
        <thead>
          <tr>
            <th className="text-end" style={{ width: '2.5rem' }}>
              #
            </th>
            <th>Staker</th>
            <th className="text-end">Stake</th>
            <th className="text-end">Share</th>
            <th
              className="text-end d-none d-sm-table-cell"
              title="Its stake accounts on this validator"
            >
              Accounts
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((t, i) => (
            <tr key={t.withdrawer}>
              <td className="text-end text-body-tertiary font-monospace">
                {page * PAGE + i + 1}
              </td>
              <td
                className="text-nowrap"
                title={`Withdraw authority ${t.withdrawer}${t.staker && t.staker !== t.withdrawer ? ` · stake authority ${t.staker}` : ''}`}
              >
                <StakerName label={t.label} withdrawer={t.withdrawer} />
                {/* A pool row: the part its holders directed here. */}
                {!!holderDirected(t) && (
                  <span
                    className="text-body-tertiary fs-10 ms-2"
                    title={
                      t.directedSources?.length
                        ? directedDetail(t)
                        : "Directed here by the pool's holders (the rest the pool chose)"
                    }
                  >
                    {sol(holderDirected(t))} directed
                  </span>
                )}
              </td>
              <td className="text-end font-monospace">{sol(t.stake)}</td>
              <td className="text-end font-monospace">
                {((t.share ?? t.stake / (d.stake || 1)) * 100).toFixed(1)}%
              </td>
              <td className="text-end font-monospace text-body-tertiary d-none d-sm-table-cell">
                {t.stakeAccounts?.toLocaleString() ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {pages > 1 && (
        <Pager
          page={page}
          pages={pages}
          total={top.length}
          pageSize={PAGE}
          shown={shown.length}
          onPrev={() => setPage(p => p - 1)}
          onNext={() => setPage(p => p + 1)}
          onPage={setPage}
        />
      )}
      <p className="fs-10 text-body-tertiary mt-2 mb-0">
        {d.delegators.toLocaleString()} stakers
        {d.stakeAccounts != null &&
          ` · ${d.stakeAccounts.toLocaleString()} stake accounts`}
        {!!d.moreDelegators &&
          ` · ${d.moreDelegators.toLocaleString()} more not listed`}
      </p>
    </>
  );
};

/**
 * Who stakes to a validator, at the last completed epoch's end
 * (/validators/delegators): its top stakers, or (`part="sizes"`) the
 * stake-size distribution - the Staking tab puts them apart, Top Stakers
 * first and Stake Sizes last. Shows nothing until the API serves it.
 */
const DelegatorsCards = ({
  identity,
  part = 'top'
}: {
  identity: string;
  part?: 'top' | 'sizes';
}) => {
  const context = useContext(VortexDataContext);
  const fetchData = context?.delegatorsState.fetchData;
  const d = context?.delegatorsState.data.get(identity);
  useEffect(() => {
    if (identity) fetchData?.(identity);
  }, [identity, fetchData]);
  // Pools only: stake pools, Marinade and SFDP (the named stakers).
  const [poolsOnly, setPoolsOnly] = useState(false);
  if (!d) return null;
  const top = poolsOnly ? d.top.filter(t => t.label) : d.top;
  if (part === 'sizes')
    return (
      <SectionCard
        title={`Stake Sizes · epoch ${d.epoch}`}
        icon="bar-chart"
        info="Its stakers grouped by how much they stake here (a stake pool counts as one)."
      >
        {d.sizes.length ? (
          <StakeSizes d={d} />
        ) : (
          <p className="fs-9 text-body-tertiary mb-0">No stake.</p>
        )}
      </SectionCard>
    );
  return (
    <SectionCard
      title={`Top Stakers · epoch ${d.epoch}`}
      icon="users"
      info="Its largest stakers at the epoch's end. Pools are named and link to their pages."
    >
      {/* As the Stake Sizes card's toggle. */}
      <div className="d-flex align-items-center justify-content-between mb-1">
        <span className="fs-10 text-body-tertiary">
          {poolsOnly
            ? 'Stake pools, Marinade and SFDP'
            : 'Largest first, by withdraw authority'}
        </span>
        <ButtonGroup size="sm">
          {([false, true] as const).map(v => (
            <ToggleButton
              key={String(v)}
              id={`top-stakers-${v ? 'pools' : 'all'}`}
              type="radio"
              name="top-stakers"
              variant="soft-secondary"
              value={String(v)}
              checked={poolsOnly === v}
              onChange={() => setPoolsOnly(v)}
            >
              {v ? 'Pools only' : 'All stakers'}
            </ToggleButton>
          ))}
        </ButtonGroup>
      </div>
      {top.length ? (
        <TopStakers key={String(poolsOnly)} d={d} top={top} />
      ) : (
        <p className="fs-9 text-body-tertiary mb-0">
          {poolsOnly ? 'No pools stake here.' : 'No stakers.'}
        </p>
      )}
    </SectionCard>
  );
};

export default DelegatorsCards;
