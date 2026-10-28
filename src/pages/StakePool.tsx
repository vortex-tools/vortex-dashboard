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
  compactSol,
  pct,
  signedCount,
  signedSol
} from 'components/pools/pools';
import useAdvanceTable from 'hooks/useAdvanceTable';
import AdvanceTableProvider from 'providers/AdvanceTableProvider';
import { useAppContext } from 'providers/AppProvider';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { PoolDetail, PoolValidatorRef } from 'providers/vortex-schemas';
import { Fragment, useContext, useEffect, useMemo, useState } from 'react';
import { Col, Row, Table } from 'react-bootstrap';
import { Link, useParams } from 'react-router';

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
const END = {
  headerProps: { className: 'text-nowrap text-end' },
  cellProps: { className: 'text-nowrap text-end font-monospace' }
};

const columns = (isSfdp: boolean): ColumnDef<Validator>[] => [
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
        {compactSol(v.stake)}
        <Delta now={v.stake} prev={v.stakePrev} format={signedSol} />
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
  {
    id: 'shareOfValidator',
    header: "Of the validator's stake",
    accessorFn: v => v.shareOfValidator ?? 0,
    cell: ({ row: { original: v } }) => pct(v.shareOfValidator),
    meta: END
  },
  ...(isSfdp
    ? []
    : [
        {
          id: 'sfdp',
          header: 'SFDP there',
          accessorFn: (v: Validator) => v.sfdpStake ?? 0,
          cell: ({ row: { original: v } }: { row: { original: Validator } }) =>
            v.sfdpStake ? (
              compactSol(v.sfdpStake)
            ) : (
              <span className="text-body-quaternary">—</span>
            ),
          meta: END
        } as ColumnDef<Validator>
      ])
];

/** Who a pool stakes to, ranked: each validator's share of the pool as a
 *  bar, and the running total as a line (how few hold most of it). */
const ConcentrationChart = ({ validators }: { validators: Validator[] }) => {
  const { getThemeColor } = useAppContext();
  const top = validators.slice(0, 100);
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
        interval: (i: number) => (i + 1) % 10 === 0 || i === 0
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
        barCategoryGap: '20%'
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
          formatter: (v: number) => compactSol(v)
        },
        splitLine: { lineStyle: { color: getThemeColor('border-color') } }
      },
      {
        type: 'value',
        scale: true,
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
  const validators = useMemo(
    () => [...(data?.validators ?? [])].sort((a, b) => b.stake - a.stake),
    [data]
  );
  const table = useAdvanceTable({
    columns: useMemo(() => columns(isSfdp), [isSfdp]),
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
          <UntrackedState>
            No stake pool by that name. <Link to="/pools">All stake pools</Link>
          </UntrackedState>
        ) : (
          <DelayedSpinner loading label="Loading the stake pool…" />
        )}
      </div>
    );

  const history = data.history;
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const newest = [...history].reverse();
  const overlap = validators.filter(v => (v.sfdpStake ?? 0) > 0);
  const overlapStake = overlap.reduce((a, v) => a + v.stake, 0);

  return (
    <div className="mb-9">
      <div className="page-header row g-3 align-items-start justify-content-between">
        <div className="col">
          <h3 className="d-flex align-items-center gap-2">
            {data.name}
            <KindBadge kind={data.kind} />
          </h3>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">
            {[
              data.fullName,
              data.epoch != null &&
                `end of epoch ${data.epoch.toLocaleString()}`
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="col-auto">
          <Link
            to="/pools"
            className="btn btn-soft-secondary btn-sm d-inline-flex align-items-center gap-1"
          >
            <FeatherIcon icon="arrow-left" size={12} />
            All stake pools
          </Link>
        </div>
      </div>

      <div className="d-flex flex-column gap-3">
        <Row className="g-3">
          <Col xs={6} lg={3}>
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
          <Col xs={6} lg={3}>
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
                      title="Validators it holds only its minimum stake on (10 SOL or less): not delegations, not listed"
                    >
                      +{data.minimumOnly.toLocaleString()} at the 10 SOL minimum
                    </span>
                  )}
                </>
              }
            />
          </Col>
          <Col xs={6} lg={3}>
            <StatCard
              label="Top 10"
              value={pct(data.top10Share)}
              sublabel="of the pool on its 10 largest"
            />
          </Col>
          <Col xs={6} lg={3}>
            {isSfdp ? (
              <StatCard
                label="Largest"
                mono={false}
                value={
                  validators[0]?.name ??
                  (validators[0] ? short(validators[0].voteKey) : '—')
                }
                sublabel={
                  validators[0]
                    ? `${pct(validators[0].shareOfPool, 2)} of SFDP`
                    : undefined
                }
              />
            ) : (
              <StatCard
                label="Overlap with SFDP"
                value={`${overlap.length.toLocaleString()} validators`}
                mono={false}
                sublabel={`${pct(data.stake ? overlapStake / data.stake : null)} of the pool's stake`}
              />
            )}
          </Col>
        </Row>

        <Row className="g-3">
          <Col xs={12} lg={6}>
            <SectionCard
              title="Concentration"
              icon="bar-chart-2"
              info="The validators it stakes to, largest first (up to 100): each one's share of the pool as a bar, and the running total as a line - how few validators hold most of the pool."
            >
              {validators.length ? (
                <ConcentrationChart validators={validators} />
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
          info="Everyone it delegates to at the end of the epoch (holdings over 10 SOL; a pool's minimum stake isn't a delegation and isn't listed), by effective stake: its share of the pool, its share of the validator's whole stake, the change since the epoch before (new: not staked there then), and SFDP's stake on the same validator. Validator names are today's."
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
          info="Newest first: its stake and validator count at each epoch's end, the validators it started staking to (added), stopped staking to (dropped), and moved stake on. Moves leave out reward compounding (the pool's median growth that epoch), so small moves on big holdings can be noise."
        >
          {newest.length ? (
            <Table responsive size="sm" className="data-table fs-9 mb-0">
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
                          {before && (
                            <Delta
                              now={h.stake}
                              prev={before.stake}
                              format={signedSol}
                            />
                          )}
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
