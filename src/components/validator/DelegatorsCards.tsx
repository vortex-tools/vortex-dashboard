import { directedDetail, directedTotal } from 'components/pools/directed';
import FeatherIcon from 'components/base/FeatherIcon';
import { CardSkeleton } from 'components/common/PageSkeleton';
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
      confine: true,
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

/** A staker's stake changing next epoch: joining less leaving, with a
 *  green rise / red fall (as the Next Epoch stat), the parts on hover. */
const NextEpochChange = ({
  activating,
  deactivating
}: {
  activating: number | null | undefined;
  deactivating: number | null | undefined;
}) => {
  const a = activating ?? 0;
  const d = deactivating ?? 0;
  const net = a - d;
  if (net === 0 && a === 0)
    return <span className="text-body-quaternary">—</span>;
  return (
    <span
      title={[a > 0 && `+${sol(a)} joining`, d > 0 && `−${sol(d)} leaving`]
        .filter(Boolean)
        .join(' · ')}
    >
      {net !== 0 && (
        <FeatherIcon
          icon={net > 0 ? 'trending-up' : 'trending-down'}
          size={12}
          // Inline on the text's baseline: the row keeps its height.
          className={`me-1 align-baseline ${net > 0 ? 'text-success' : 'text-danger'}`}
          aria-label={net > 0 ? 'Up' : 'Down'}
        />
      )}
      {sol(Math.abs(net))}
    </span>
  );
};

/** Every staker with stake moving at this epoch's end (live), largest
 *  net first: its stake here now (if in the top list), joining, leaving,
 *  net. */
const NextEpochChanges = ({
  d,
  changes
}: {
  d: ValidatorDelegators;
  changes: NonNullable<ValidatorDelegators['changes']>;
}) => {
  const [page, setPage] = useState(0);
  const pages = Math.ceil(changes.length / PAGE);
  const shown = changes.slice(page * PAGE, (page + 1) * PAGE);
  const dash = <span className="text-body-quaternary">—</span>;
  return (
    <>
      <Table responsive size="sm" className="data-table fs-9 mb-0">
        <thead>
          <tr>
            <th className="text-end" style={{ width: '2.5rem' }}>
              #
            </th>
            <th>Staker</th>
            <th
              className="text-end"
              title="Its stake earning here now (stakers in the top list)"
            >
              Stake
            </th>
            <th
              className="text-end"
              title="Activating: earning from next epoch (pending until then)"
            >
              Joining
            </th>
            <th
              className="text-end"
              title="Deactivating: stops earning at this epoch's end"
            >
              Leaving
            </th>
            <th className="text-end">Net</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((c, i) => (
            <tr key={c.withdrawer}>
              <td className="text-end text-body-tertiary font-monospace">
                {page * PAGE + i + 1}
              </td>
              <td
                className="text-nowrap"
                title={`Withdraw authority ${c.withdrawer}${c.staker && c.staker !== c.withdrawer ? ` · stake authority ${c.staker}` : ''}`}
              >
                <StakerName label={c.label} withdrawer={c.withdrawer} />
              </td>
              <td className="text-end font-monospace">
                {c.stake != null ? sol(c.stake) : dash}
              </td>
              <td className="text-end font-monospace text-success">
                {c.activating ? `+${sol(c.activating)}` : dash}
              </td>
              <td className="text-end font-monospace text-danger">
                {c.deactivating ? `−${sol(c.deactivating)}` : dash}
              </td>
              <td className="text-end font-monospace text-nowrap">
                <NextEpochChange
                  activating={c.activating}
                  deactivating={c.deactivating}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {pages > 1 && (
        <Pager
          page={page}
          pages={pages}
          total={changes.length}
          pageSize={PAGE}
          shown={shown.length}
          onPrev={() => setPage(p => p - 1)}
          onNext={() => setPage(p => p + 1)}
          onPage={setPage}
        />
      )}
      <p className="fs-10 text-body-tertiary mt-2 mb-0">
        {(d.activating ?? 0) > 0 && `+${sol(d.activating!)} joining`}
        {(d.activating ?? 0) > 0 && (d.deactivating ?? 0) > 0 && ' · '}
        {(d.deactivating ?? 0) > 0 && `−${sol(d.deactivating!)} leaving`}
        {d.moreChanges
          ? ` · ${d.moreChanges.toLocaleString()} more stakers moving`
          : ''}
      </p>
    </>
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
  // The epoch in progress: what each staker has changing next epoch.
  const live = d.source === 'live' && top.some(t => t.activating != null);
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
            {live && (
              <th
                className="text-end"
                title="Its stake changing at the epoch's end: joining (activating) less leaving (deactivating), earning from next epoch"
              >
                Next Epoch
              </th>
            )}
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
                {/* A pool row: the part directed here (by its holders, a protocol, the pool, matching). */}
                {!!directedTotal(t) && (
                  <span
                    className="text-body-tertiary fs-10 ms-2"
                    title={
                      t.directedSources?.length
                        ? directedDetail(t)
                        : "Directed here by the pool's holders"
                    }
                  >
                    {sol(directedTotal(t))} directed
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
              {live && (
                <td className="text-end font-monospace text-nowrap">
                  <NextEpochChange
                    activating={t.activating}
                    deactivating={t.deactivating}
                  />
                </td>
              )}
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
  // All stakers; pools only (stake pools, Marinade and SFDP: the named
  // stakers); or, live, the stakers with stake moving next epoch.
  const [view, setView] = useState<'all' | 'pools' | 'next'>('all');
  const poolsOnly = view === 'pools';
  // While it loads, its place (a table, or the sizes' chart); none if the
  // read failed.
  if (!d)
    return context?.delegatorsState.error &&
      !context.delegatorsState.isLoading ? null : (
      <CardSkeleton
        kind={part === 'sizes' ? 'chart' : 'table'}
        height={part === 'sizes' ? 364 : 488}
      />
    );
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
          {view === 'next'
            ? "Stake moving at this epoch's end, largest first · joining is pending until then (can be cancelled), leaving is final"
            : poolsOnly
              ? 'Stake pools, Marinade and SFDP'
              : 'Largest first, by withdraw authority'}
        </span>
        <ButtonGroup size="sm">
          {(
            [
              ['all', 'All stakers'],
              ['pools', 'Pools only'],
              ...(d.changes ? [['next', 'Next epoch']] : [])
            ] as Array<['all' | 'pools' | 'next', string]>
          ).map(([v, label]) => (
            <ToggleButton
              key={v}
              id={`top-stakers-${v}`}
              type="radio"
              name="top-stakers"
              variant="soft-secondary"
              value={v}
              checked={view === v}
              onChange={() => setView(v)}
            >
              {label}
            </ToggleButton>
          ))}
        </ButtonGroup>
      </div>
      {view === 'next' && d.changes ? (
        d.changes.length ? (
          <NextEpochChanges d={d} changes={d.changes} />
        ) : (
          <p className="fs-9 text-body-tertiary mb-0">
            No stake moving at this epoch&apos;s end.
          </p>
        )
      ) : top.length ? (
        <TopStakers key={view} d={d} top={top} />
      ) : (
        <p className="fs-9 text-body-tertiary mb-0">
          {poolsOnly ? 'No pools stake here.' : 'No stakers.'}
        </p>
      )}
    </SectionCard>
  );
};

export default DelegatorsCards;
