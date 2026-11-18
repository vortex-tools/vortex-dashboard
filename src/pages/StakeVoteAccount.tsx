import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import PageSkeleton, { SKELETON } from 'components/common/PageSkeleton';
import StakeLookup from 'components/stake/StakeLookup';
import SectionCard from 'components/common/SectionCard';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import { API_ENDPOINT } from 'helpers/apiEndpoint';
import { noPointer } from 'helpers/echart-utils';
import { formatLamports } from 'helpers/utils';
import useValidatorIdentity from 'hooks/useValidatorIdentity';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useAppContext } from 'providers/AppProvider';
import { useContext, useEffect, useMemo, useState } from 'react';
import {
  Button,
  ButtonGroup,
  Col,
  Form,
  Row,
  Table,
  ToggleButton
} from 'react-bootstrap';
import { Link, useParams } from 'react-router';
import { z } from 'zod';

echarts.use([
  BarChart,
  LineChart,
  DataZoomComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer
]);

/** Epochs the history chart opens on (zoom out for all). */
const CHART_WINDOW = 100;
/** Delegations per page. */
const LIMIT = 50;

const num = z.number().nullable().catch(null);
const historySchema = z.object({
  voteKey: z.string(),
  epochs: z.array(
    z.object({
      epoch: z.number(),
      activated: num,
      delegators: num,
      inflationBps: num,
      blockBps: num,
      inflationReward: num,
      blockReward: num
    })
  )
});
type History = z.infer<typeof historySchema>;
const delegationsSchema = z.object({
  epoch: z.number(),
  total: z.number().catch(0),
  delegations: z
    .array(
      z.object({
        stakeAccount: z.string(),
        effective: num,
        activating: num,
        deactivating: num,
        inflationReward: num,
        blockReward: num,
        staker: z.string().nullable().catch(null),
        withdrawer: z.string().nullable().catch(null),
        change: z
          .object({
            kind: z.string().catch('same'),
            delta: num,
            // New here, moved from another validator: which.
            previousVoteKey: z.string().nullable().optional().catch(null),
            previousName: z.string().nullable().optional().catch(null),
            // Stake-account splits, matched within this vote account: the
            // new account's source, and the source's new accounts.
            splitFrom: z.string().nullable().optional().catch(null),
            splitTo: z
              .union([z.array(z.string()), z.string()])
              .nullable()
              .optional()
              .transform(v => (v == null ? [] : Array.isArray(v) ? v : [v]))
              .catch([])
          })
          .nullable()
          .catch(null)
      })
    )
    .catch([]),
  // filter=gone: the stake accounts that left since the epoch before,
  // and where each is now.
  gone: z
    .array(
      z.object({
        stakeAccount: z.string(),
        effective: num,
        voteKeyNow: z.string().nullable().catch(null),
        nameNow: z.string().nullable().catch(null)
      })
    )
    .optional()
    .catch([]),
  changeTotals: z
    .object({
      new: num,
      increased: num,
      decreased: num,
      gone: num,
      goneCount: num
    })
    .nullable()
    .optional()
    .catch(null),
  // Rows to skip for the next page (a number or a string).
  nextCursor: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform(v => (v == null ? null : String(v)))
    .catch(null)
});
type Delegations = z.infer<typeof delegationsSchema>;

const sol = (l: number | null | undefined, d = 2) =>
  l == null ? '—' : formatLamports(l, d);
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const pct = (bps: number | null | undefined) =>
  bps == null ? '—' : `${(bps / 100).toLocaleString('en-US')}%`;
const rewards = (r: {
  inflationReward: number | null;
  blockReward: number | null;
}) =>
  r.inflationReward == null && r.blockReward == null
    ? null
    : (r.inflationReward ?? 0) + (r.blockReward ?? 0);

const CHANGE: Record<string, { label: string; tone: string }> = {
  new: { label: 'New', tone: 'success' },
  increased: { label: 'Increased', tone: 'info' },
  decreased: { label: 'Decreased', tone: 'warning' },
  gone: { label: 'Left', tone: 'danger' }
};

type Sort = 'effective' | 'rewards' | 'change';
type Filter = 'all' | 'changed' | 'activating' | 'deactivating' | 'gone';
const FILTERS: Filter[] = [
  'all',
  'changed',
  'activating',
  'deactivating',
  'gone'
];

/** Its stake per epoch (line), delegators (bars, right axis), and a
 *  dashed mark where its inflation commission changed. */
const HistoryChart = ({ rows }: { rows: History['epochs'] }) => {
  const { getThemeColor } = useAppContext();
  const changes = rows.filter(
    (r, i) => i > 0 && r.inflationBps !== rows[i - 1].inflationBps
  );
  const start = Math.max(0, ((rows.length - CHART_WINDOW) / rows.length) * 100);
  const option = {
    animation: false,
    grid: { left: 4, right: 8, top: 16, bottom: 36, containLabel: true },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: getThemeColor('body-highlight-bg'),
      borderColor: getThemeColor('border-color'),
      textStyle: { color: getThemeColor('body-color'), fontSize: 12 },
      formatter: (ps: Array<{ dataIndex: number }>) => {
        const r = rows[ps[0]?.dataIndex ?? 0];
        if (!r) return '';
        return (
          `<div class="fw-bold mb-1">Epoch ${r.epoch}</div>` +
          `<div>Stake <b>${sol(r.activated, 0)}</b></div>` +
          `<div>Delegators ${r.delegators?.toLocaleString() ?? '—'}</div>` +
          `<div>Commission ${pct(r.inflationBps)} inflation · ${pct(r.blockBps)} block</div>` +
          (rewards(r) != null
            ? `<div class="text-body-tertiary">Rewards to stakers and it ${sol(rewards(r), 2)}</div>`
            : '')
        );
      }
    },
    xAxis: {
      type: 'category',
      data: rows.map(r => r.epoch),
      axisLabel: { color: getThemeColor('tertiary-color'), fontSize: 10 },
      axisTick: { show: false }
    },
    yAxis: [
      {
        type: 'value',
        axisLabel: {
          color: getThemeColor('tertiary-color'),
          fontSize: 10,
          formatter: (v: number) => formatLamports(v, 0)
        },
        splitLine: { lineStyle: { color: getThemeColor('border-color') } }
      },
      // Delegators: the bottom third, under the stake line.
      {
        type: 'value',
        max: Math.max(1, ...rows.map(r => r.delegators ?? 0)) * 3,
        axisLabel: { show: false },
        splitLine: { show: false }
      }
    ],
    dataZoom: [
      { type: 'inside', start, end: 100 },
      { type: 'slider', start, end: 100, height: 16, bottom: 4 }
    ],
    series: [
      {
        name: 'Delegators',
        type: 'bar',
        yAxisIndex: 1,
        barMaxWidth: 8,
        color: getThemeColor('info'),
        itemStyle: { opacity: 0.35 },
        data: rows.map(r => r.delegators)
      },
      {
        name: 'Stake',
        type: 'line',
        symbol: 'none',
        color: getThemeColor('primary'),
        areaStyle: { opacity: 0.12 },
        data: rows.map(r => r.activated),
        markLine: {
          silent: true,
          symbol: 'none',
          label: {
            formatter: (p: { name: string }) => p.name,
            fontSize: 10,
            color: getThemeColor('tertiary-color')
          },
          lineStyle: { type: 'dashed', color: getThemeColor('warning') },
          data: changes.map(c => ({
            xAxis: String(c.epoch),
            name: pct(c.inflationBps)
          }))
        }
      }
    ]
  };
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={noPointer(option)}
      notMerge
      style={{ height: 280, width: '100%' }}
    />
  );
};

/** The latest epoch whose delegations are stored (the API loads them
 *  from epoch 0 up): a binary search over /epochs/stakes'
 *  delegationsComplete, once a session (stake sets never change, so the
 *  answers are cached). For an API without the per-vote stake history,
 *  which would otherwise list the epochs. */
let loadedThrough: Promise<number | null> | null = null;
const latestLoadedEpoch = (current: number) =>
  (loadedThrough ??= (async () => {
    const complete = async (e: number) => {
      const r = await fetch(`${API_ENDPOINT}/epochs/stakes?epoch=${e}`);
      if (!r.ok) return false;
      return !!(await r.json())?.delegationsComplete;
    };
    // The last answer, saved in the browser: usually still right, or
    // a little further on (the load only moves forward).
    const KEY = 'vx-delegations-loaded-through';
    let hint: number | null = null;
    try {
      const saved = localStorage.getItem(KEY);
      const v = saved == null ? NaN : Number(saved);
      if (Number.isInteger(v) && v >= 0 && v <= current) hint = v;
    } catch {
      // no storage: search from scratch
    }
    const save = (e: number | null) => {
      try {
        if (e != null) localStorage.setItem(KEY, String(e));
      } catch {
        // ignore
      }
      return e;
    };
    if (hint != null) {
      const [at, after] = await Promise.all([
        complete(hint),
        hint < current ? complete(hint + 1) : Promise.resolve(false)
      ]);
      if (at && !after) return save(hint);
    }
    if (await complete(current)) return save(current);
    // lo: the latest known loaded (-1: none yet); hi: known not loaded.
    let lo = -1;
    let hi = current;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (await complete(mid)) lo = mid;
      else hi = mid;
    }
    return lo < 0 ? null : save(lo);
  })());

/** Its delegations in one epoch: sorted and filtered by the
 *  API, 50 at a time, each with what changed since the epoch before. */
const DelegationsCard = ({
  voteKey,
  epochs
}: {
  voteKey: string;
  epochs: number[];
}) => {
  const [epoch, setEpoch] = useState(epochs[0]);
  const [sort, setSort] = useState<Sort>('effective');
  const [filter, setFilter] = useState<Filter>('all');
  // Every filter's pages for the picked epoch and sort: all of them
  // fetched together, so switching filter needs no request (only More,
  // or a new epoch or sort, asks).
  const [byFilter, setByFilter] = useState<
    Partial<Record<Filter, Delegations[]>>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = (f: Filter, cursor: string | null) => {
    const q = new URLSearchParams({
      voteKey,
      epoch: String(epoch),
      sort,
      dir: 'desc',
      limit: String(LIMIT),
      ...(f !== 'all' ? { filter: f } : {}),
      ...(cursor ? { cursor } : {})
    });
    return fetch(`${API_ENDPOINT}/epochs/delegations?${q}`)
      .then(r => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then(j => delegationsSchema.parse(j));
  };
  useEffect(() => {
    let alive = true;
    setByFilter({});
    setError(null);
    for (const f of FILTERS)
      load(f, null).then(
        p => alive && setByFilter(b => ({ ...b, [f]: [p] })),
        e => alive && f === 'all' && setError(String(e))
      );
    return () => {
      alive = false;
    };
    // (load reads these.)
  }, [voteKey, epoch, sort]);
  const pages = byFilter[filter] ?? [];
  const more = () => {
    const cursor = pages[pages.length - 1]?.nextCursor ?? null;
    if (!cursor) return;
    setLoading(true);
    load(filter, cursor)
      .then(
        p => setByFilter(b => ({ ...b, [filter]: [...(b[filter] ?? []), p] })),
        e => setError(String(e))
      )
      .finally(() => setLoading(false));
  };
  const rows = pages.flatMap(p => p.delegations);
  const gone = pages.flatMap(p => p.gone ?? []);
  const totals = (byFilter.all ?? pages)[0]?.changeTotals ?? null;
  const next = pages[pages.length - 1]?.nextCursor ?? null;
  const total = pages[0]?.total ?? null;
  const waiting = !byFilter[filter];

  return (
    <SectionCard
      title="Delegations"
      icon="users"
      info="Every stake account delegated to it at the end of the epoch you pick, with its rewards, authorities and what changed since the epoch before: New (and from which validator, if it moved), Split (a new account split off another of its accounts; the source shows Decreased and what it split into), Increased, Decreased; Left lists the ones that went, and where they are now. Sorted and filtered by the API, 50 at a time."
    >
      <Row className="g-2 align-items-center mb-3">
        <Col xs={6} md="auto">
          <Form.Select
            size="sm"
            value={epoch}
            onChange={e => setEpoch(Number(e.target.value))}
            aria-label="Epoch"
          >
            {epochs.map(e => (
              <option key={e} value={e}>
                Epoch {e}
              </option>
            ))}
          </Form.Select>
        </Col>
        <Col xs={6} md="auto">
          <Form.Select
            size="sm"
            value={sort}
            onChange={e => setSort(e.target.value as Sort)}
            aria-label="Sort"
          >
            <option value="effective">By stake</option>
            <option value="rewards">By rewards</option>
            <option value="change">By change</option>
          </Form.Select>
        </Col>
        <Col xs={12} md="auto">
          <ButtonGroup size="sm">
            {(
              [
                ['all', 'All'],
                ['changed', 'Changed'],
                ['activating', 'Activating'],
                ['deactivating', 'Deactivating'],
                ['gone', 'Left']
              ] as const
            ).map(([k, l]) => (
              <ToggleButton
                key={k}
                id={`delegations-${k}`}
                type="radio"
                name="delegations-filter"
                variant="soft-secondary"
                value={k}
                checked={filter === k}
                onChange={() => setFilter(k)}
              >
                {l}
              </ToggleButton>
            ))}
          </ButtonGroup>
        </Col>
      </Row>
      {error ? (
        <UntrackedState>
          Couldn't load its delegations ({error}).
        </UntrackedState>
      ) : (
        <>
          {totals && (
            <div className="d-flex flex-wrap column-gap-3 fs-9 mb-2">
              <span className="text-body-tertiary">
                Since the epoch before:
              </span>
              <span>New {sol(totals.new, 0)}</span>
              <span>Increased {sol(totals.increased, 0)}</span>
              <span>Decreased {sol(totals.decreased, 0)}</span>
              <span>
                Left {sol(totals.gone, 0)}
                {totals.goneCount != null &&
                  ` (${totals.goneCount.toLocaleString()} accounts)`}
              </span>
            </div>
          )}
          {filter === 'gone' ? (
            <Table responsive size="sm" className="data-table fs-9 mb-0">
              <thead>
                <tr className="text-nowrap">
                  <th>Stake Account</th>
                  <th className="text-end">Stake It Had</th>
                  <th>Now With</th>
                </tr>
              </thead>
              <tbody>
                {gone.map(g => (
                  <tr key={g.stakeAccount}>
                    <td className="font-monospace">
                      <Link to={`/stake/account/${g.stakeAccount}`}>
                        {short(g.stakeAccount)}
                      </Link>
                    </td>
                    <td className="text-end text-nowrap">
                      {sol(g.effective, 2)}
                    </td>
                    <td className="text-truncate" style={{ maxWidth: '18rem' }}>
                      {g.voteKeyNow ? (
                        <Link to={`/stake/vote/${g.voteKeyNow}`}>
                          {g.nameNow ?? short(g.voteKeyNow)}
                        </Link>
                      ) : (
                        <span className="text-body-tertiary">
                          Not delegated
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Table responsive size="sm" className="data-table fs-9 mb-0">
              <thead>
                <tr className="text-nowrap">
                  <th>Stake Account</th>
                  <th className="text-end">Effective</th>
                  <th className="text-end">Activating</th>
                  <th className="text-end">Deactivating</th>
                  <th className="text-end">Rewards</th>
                  <th>Change</th>
                  <th>Staker</th>
                  <th>Withdrawer</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(d => {
                  const split = !!d.change?.splitFrom;
                  const c =
                    d.change &&
                    (split
                      ? { label: 'Split', tone: 'info' }
                      : CHANGE[d.change.kind]);
                  return (
                    <tr key={d.stakeAccount}>
                      <td className="font-monospace">
                        <Link to={`/stake/account/${d.stakeAccount}`}>
                          {short(d.stakeAccount)}
                        </Link>
                      </td>
                      <td className="text-end text-nowrap">
                        {sol(d.effective, 2)}
                      </td>
                      <td className="text-end text-nowrap">
                        {d.activating ? sol(d.activating, 2) : '—'}
                      </td>
                      <td className="text-end text-nowrap">
                        {d.deactivating ? sol(d.deactivating, 2) : '—'}
                      </td>
                      <td className="text-end text-nowrap">
                        {sol(rewards(d), 4)}
                      </td>
                      <td className="text-nowrap">
                        {c && (
                          <span
                            className={`badge badge-soft badge-soft-${c.tone}`}
                          >
                            {c.label}
                          </span>
                        )}
                        {c &&
                          d.change?.delta != null &&
                          d.change.delta !== 0 && (
                            <span className="text-body-tertiary fs-10 ms-1">
                              {d.change.delta > 0 ? '+' : '−'}
                              {sol(Math.abs(d.change.delta), 2)}
                            </span>
                          )}
                        {d.change?.splitFrom && (
                          <div className="fs-10 text-body-tertiary">
                            from{' '}
                            <Link
                              to={`/stake/account/${d.change.splitFrom}`}
                              className="font-monospace"
                            >
                              {short(d.change.splitFrom)}
                            </Link>
                          </div>
                        )}
                        {!!d.change?.splitTo?.length && (
                          <div className="fs-10 text-body-tertiary">
                            split into{' '}
                            {d.change.splitTo.length > 2
                              ? `${d.change.splitTo.length} accounts`
                              : d.change.splitTo.map((a, i) => (
                                  <span key={a}>
                                    {i > 0 && ', '}
                                    <Link
                                      to={`/stake/account/${a}`}
                                      className="font-monospace"
                                    >
                                      {short(a)}
                                    </Link>
                                  </span>
                                ))}
                          </div>
                        )}
                        {d.change?.previousVoteKey && (
                          <div className="fs-10 text-body-tertiary">
                            from{' '}
                            <Link
                              to={`/stake/vote/${d.change.previousVoteKey}`}
                            >
                              {d.change.previousName ??
                                short(d.change.previousVoteKey)}
                            </Link>
                          </div>
                        )}
                      </td>
                      <td className="font-monospace text-body-tertiary">
                        {d.staker ? short(d.staker) : '—'}
                      </td>
                      <td className="font-monospace text-body-tertiary">
                        {d.withdrawer ? short(d.withdrawer) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          <div className="d-flex align-items-center justify-content-between mt-2 fs-9 text-body-tertiary">
            <span>
              {total != null
                ? `${(filter === 'gone' ? gone.length : rows.length).toLocaleString()} of ${total.toLocaleString()}`
                : waiting
                  ? 'Loading…'
                  : ''}
            </span>
            {next && (
              <Button
                size="sm"
                variant="soft-secondary"
                disabled={loading}
                onClick={more}
              >
                {loading ? 'Loading…' : 'More'}
              </Button>
            )}
          </div>
        </>
      )}
    </SectionCard>
  );
};

/** An API with delegations but not yet the per-vote stake history: a
 *  note, and its delegations from the latest epoch loaded down. */
const NoHistory = ({
  voteKey,
  currentEpoch
}: {
  voteKey: string;
  currentEpoch: number | null;
}) => {
  const [latest, setLatest] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (currentEpoch == null) return;
    let alive = true;
    latestLoadedEpoch(currentEpoch).then(
      e => alive && setLatest(e),
      () => alive && setLatest(null)
    );
    return () => {
      alive = false;
    };
  }, [currentEpoch]);
  const epochs = useMemo(
    () =>
      latest == null
        ? []
        : Array.from({ length: latest + 1 }, (_, i) => latest - i),
    [latest]
  );
  return (
    <div className="d-flex flex-column gap-3">
      <UntrackedState>
        Its stake history isn&apos;t served by this API yet.
        {latest != null
          ? ` Delegations are loaded through epoch ${latest} so far; later epochs fill in as the data loads.`
          : latest === null
            ? ' No epoch\u2019s delegations are loaded yet either.'
            : ''}
      </UntrackedState>
      {latest === undefined ? (
        <PageSkeleton rows={[[{ w: 12, h: 600, kind: 'table' }]]} />
      ) : (
        epochs.length > 0 && (
          <DelegationsCard voteKey={voteKey} epochs={epochs} />
        )
      )}
    </div>
  );
};

/**
 * A vote account in the Stake explorer (/stake/vote/:voteKey): its stake,
 * delegators and commission every epoch (/validators/stake-history, one
 * request) and its delegations for a picked epoch (/epochs/delegations,
 * a page at a time). Staging only for now.
 */
const StakeVoteAccount = () => {
  const { voteKey = '' } = useParams();
  const context = useContext(VortexDataContext);
  const currentEpoch = context?.currentEpochState.epoch ?? null;
  const identity = useValidatorIdentity(voteKey);
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    fetch(
      `${API_ENDPOINT}/validators/stake-history?voteKey=${encodeURIComponent(voteKey)}`
    )
      .then(async r => {
        if (r.ok) return r.json();
        // A 404 with no body is the route itself missing (an API without
        // the Stake explorer yet); the API's own 404 says what it lacks.
        if (r.status === 404)
          return Promise.reject(
            (await r.text()).trim() ? 'not found' : 'no route'
          );
        return Promise.reject(`HTTP ${r.status}`);
      })
      .then(j => alive && setData(historySchema.parse(j)))
      .catch(e => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [voteKey]);

  const rows = useMemo(
    () => [...(data?.epochs ?? [])].sort((a, b) => a.epoch - b.epoch),
    [data]
  );
  const latest = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const epochsDesc = useMemo(() => rows.map(r => r.epoch).reverse(), [rows]);
  const name =
    identity && identity.source !== 'fallback' ? identity.displayName : null;
  const delta =
    latest?.delegators != null && prev?.delegators != null
      ? latest.delegators - prev.delegators
      : null;

  const header = (
    <div className="page-header row g-3 align-items-start justify-content-between">
      <div className="col-auto">
        <Link to="/stake" className="d-block fs-9 mb-1">
          ← Stake Explorer
        </Link>
        <h1 className="h3">{name ?? short(voteKey)}</h1>
        <p className="text-body-tertiary lh-sm mb-0 mt-1">
          Vote account <span className="font-monospace">{short(voteKey)}</span>
        </p>
      </div>
      <div className="col-12 col-md-auto align-self-end d-flex flex-column align-items-md-end gap-2">
        <Link to={`/validator/${voteKey}`} className="fs-9">
          Validator page →
        </Link>
        <StakeLookup compact />
      </div>
    </div>
  );

  if (error === 'no route')
    return (
      <div className="mb-9">
        {header}
        <NoHistory voteKey={voteKey} currentEpoch={currentEpoch} />
      </div>
    );
  if (error)
    return (
      <div className="mb-9">
        {header}
        <UntrackedState>
          {error === 'not found'
            ? 'No vote account with this address in the recorded epochs.'
            : error === 'no route'
              ? 'Stake history isn\u2019t served by this API yet: the Stake Explorer\u2019s data is still loading, and this page fills in once it\u2019s up.'
              : `Couldn't load this vote account (${error}).`}
        </UntrackedState>
      </div>
    );
  if (!data)
    return (
      <div className="mb-9">
        {header}
        <PageSkeleton rows={SKELETON.stakeVoteAccount} />
      </div>
    );

  return (
    <div className="mb-9">
      {header}
      <div className="d-flex flex-column gap-3">
        <Row className="g-3">
          <Col xs={6} xl={3}>
            <StatCard
              label="Stake"
              value={sol(latest?.activated, 0)}
              sublabel={latest ? `epoch ${latest.epoch}` : undefined}
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              label="Delegators"
              value={latest?.delegators?.toLocaleString() ?? '—'}
              sublabel={
                delta != null
                  ? `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toLocaleString()} vs epoch ${prev!.epoch}`
                  : undefined
              }
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              label="Commission"
              value={pct(latest?.inflationBps)}
              sublabel={`inflation · ${pct(latest?.blockBps)} block revenue`}
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              label="History"
              value={rows.length.toLocaleString()}
              sublabel={
                rows.length ? `epochs, from ${rows[0].epoch}` : undefined
              }
            />
          </Col>
        </Row>

        <SectionCard
          title="Stake History"
          icon="trending-up"
          info="Its stake per epoch (line) and delegators (bars), with a dashed mark where its inflation commission changed. The last 100 epochs at first: drag the slider or scroll for all."
        >
          <HistoryChart rows={rows} />
        </SectionCard>

        {epochsDesc.length > 0 && (
          <DelegationsCard voteKey={voteKey} epochs={epochsDesc} />
        )}
      </div>
    </div>
  );
};

export default StakeVoteAccount;
