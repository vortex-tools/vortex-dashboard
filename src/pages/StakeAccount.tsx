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
import AddressLine from 'components/common/AddressLine';
import PageSkeleton, { SKELETON } from 'components/common/PageSkeleton';
import StakeLookup from 'components/stake/StakeLookup';
import usePoolAuthorities from 'components/stake/usePoolAuthorities';
import SectionCard from 'components/common/SectionCard';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import ValidatorLink from 'components/common/ValidatorLink';
import { API_ENDPOINT } from 'helpers/apiEndpoint';
import { noPointer } from 'helpers/echart-utils';
import { explorerAddress } from 'helpers/explorer';
import { formatLamports } from 'helpers/utils';
import useCluster from 'hooks/useCluster';
import { useAppContext } from 'providers/AppProvider';
import { useEffect, useMemo, useState } from 'react';
import { Button, Col, Row, Table } from 'react-bootstrap';
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
/** Per-epoch table rows per page. */
const PAGE = 25;

const num = z.number().nullable().catch(null);
const historySchema = z.object({
  stakeAccount: z.string().optional().catch(undefined),
  // Where it stands as of the latest loaded epoch.
  summary: z
    .object({
      asOf: num,
      state: z.string().nullable().catch(null)
    })
    .nullable()
    .optional()
    .catch(null),
  epochs: z.array(
    z.object({
      epoch: z.number(),
      voteKey: z.string().nullable().catch(null),
      name: z.string().nullable().catch(null),
      // Which account at this address (0, 1, ...): a new one when a fresh
      // delegation followed an active one (the old one closed, merged).
      lifetime: z.number().catch(0),
      delegatedStake: num,
      effective: num,
      activating: num,
      deactivating: num,
      inflationReward: num,
      blockReward: num,
      activationEpoch: num,
      deactivationEpoch: num,
      // activating | active | deactivating | inactive (null: unknown).
      state: z.string().nullable().optional().catch(null)
    })
  ),
  authorities: z
    .array(
      z.object({
        epoch: z.number(),
        staker: z.string().nullable().catch(null),
        withdrawer: z.string().nullable().catch(null),
        custodian: z.string().nullable().catch(null),
        lockup: z
          .object({ unixTimestamp: num, epoch: num })
          .nullable()
          .catch(null)
      })
    )
    .catch([]),
  lifetimes: z
    .array(
      z.object({
        lifetime: z.number(),
        from: z.number(),
        to: z.number(),
        // null: still delegated; recreated: replaced by a new account at
        // this address; left: its stake left (or it closed, unrecorded).
        endedBy: z.string().nullable().catch(null)
      })
    )
    .catch([])
});
type History = z.infer<typeof historySchema>;
type EpochRow = History['epochs'][number];

const sol = (l: number | null | undefined, d = 2) =>
  l == null ? '—' : formatLamports(l, d);
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
/** Its stake at work in the epoch: effective (which still includes
 *  stake cooling down) plus stake warming up (a pool's transient account
 *  is only ever activating). Stake that finished deactivating still names
 *  the validator but isn't counted. */
const stakeOf = (r: EpochRow | undefined) =>
  !r ? null : (r.effective ?? 0) + (r.activating ?? 0);
const rewardOf = (r: EpochRow) =>
  r.inflationReward == null && r.blockReward == null
    ? null
    : (r.inflationReward ?? 0) + (r.blockReward ?? 0);
const NO_LOCKUP = 0;

/** Its delegation runs: consecutive epochs with the same validator. */
const runsOf = (rows: EpochRow[]) => {
  const runs: Array<{
    lifetime: number;
    voteKey: string | null;
    name: string | null;
    from: number;
    to: number;
    rewards: number;
    peak: number;
  }> = [];
  for (const r of rows) {
    const last = runs[runs.length - 1];
    if (
      last &&
      last.voteKey === r.voteKey &&
      r.epoch === last.to + 1 &&
      last.lifetime === r.lifetime
    ) {
      last.to = r.epoch;
      last.rewards += rewardOf(r) ?? 0;
      last.peak = Math.max(last.peak, r.effective ?? 0);
    } else
      runs.push({
        lifetime: r.lifetime,
        voteKey: r.voteKey,
        name: r.name,
        from: r.epoch,
        to: r.epoch,
        rewards: rewardOf(r) ?? 0,
        peak: r.effective ?? 0
      });
  }
  return runs;
};

/** Its stake per epoch (a step line, a dashed mark where it moved to
 *  another validator) and its rewards (bars, right axis). */
const HistoryChart = ({ rows }: { rows: EpochRow[] }) => {
  const { getThemeColor } = useAppContext();
  const moves = rows.filter(
    (r, i) => i > 0 && r.voteKey && rows[i - 1].voteKey !== r.voteKey
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
          `<div>${r.name ?? (r.voteKey ? short(r.voteKey) : 'Not delegated')}</div>` +
          `<div>Stake <b>${sol(stakeOf(r))}</b></div>` +
          `<div>Effective ${sol(r.effective)}</div>` +
          (r.activating ? `<div>Activating ${sol(r.activating)}</div>` : '') +
          (r.deactivating
            ? `<div>Deactivating ${sol(r.deactivating)}</div>`
            : '') +
          (rewardOf(r) != null
            ? `<div class="text-body-tertiary">Rewards ${sol(rewardOf(r), 4)}</div>`
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
      // Rewards: the bottom third, under the stake line.
      {
        type: 'value',
        max: Math.max(1, ...rows.map(r => rewardOf(r) ?? 0)) * 3,
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
        name: 'Rewards',
        type: 'bar',
        yAxisIndex: 1,
        barMaxWidth: 8,
        color: getThemeColor('success'),
        itemStyle: { opacity: 0.35 },
        data: rows.map(rewardOf)
      },
      {
        name: 'Effective stake',
        type: 'line',
        step: 'end',
        symbol: 'none',
        color: getThemeColor('primary'),
        lineStyle: { width: 0 },
        areaStyle: { opacity: 0.18 },
        data: rows.map(r => r.effective)
      },
      {
        name: 'Delegated stake',
        type: 'line',
        step: 'end',
        symbol: rows.length === 1 ? 'circle' : 'none',
        color: getThemeColor('primary'),
        data: rows.map(stakeOf),
        markLine: {
          silent: true,
          symbol: 'none',
          label: {
            formatter: (p: { name: string }) => p.name,
            fontSize: 10,
            color: getThemeColor('tertiary-color')
          },
          lineStyle: { type: 'dashed', color: getThemeColor('warning') },
          data: moves.map(m => ({
            xAxis: String(m.epoch),
            name: `→ ${m.name ?? short(m.voteKey!)}`
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

/** Under an authority: the stake pool it is (if one), and its own page. */
const AuthorityNote = ({
  address,
  role,
  pools
}: {
  address: string;
  role: string;
  pools: ReturnType<typeof usePoolAuthorities>;
}) => {
  const pool = pools.get(address);
  return (
    <div className="fs-10 mb-2">
      {pool && (
        <>
          <span className="badge badge-soft badge-soft-primary me-1">
            Stake pool
          </span>
          <Link to={`/pool/${encodeURIComponent(pool.name)}`}>
            {pool.fullName ?? pool.name}
          </Link>
          {' · '}
        </>
      )}
      <Link to={`/stake/authority/${address}?role=${role}`}>
        All its stake accounts
      </Link>
    </div>
  );
};

/**
 * A stake account (/stake/account/:address): every epoch it existed -
 * which validator it delegated to, its stake and rewards - its runs
 * with each validator (moves highlighted), and its authorities over time,
 * from /stake-accounts/history (one request). Staging only for now.
 */
const StakeAccount = () => {
  const pools = usePoolAuthorities();
  const { address = '' } = useParams();
  const { isTestnet } = useCluster();
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    setPage(0);
    setPickedLifetime(null);
    fetch(
      `${API_ENDPOINT}/stake-accounts/history?stakeAccount=${encodeURIComponent(address)}`
    )
      .then(async r => {
        if (r.ok) return r.json();
        // A 404 with no body is the route itself missing (an API without
        // the Stake explorer yet); the API's own 404 says why: no
        // histories stored yet, or none for this address.
        if (r.status === 404) {
          const body = (await r.text()).trim();
          if (!body) return Promise.reject('no route');
          let reason: unknown = null;
          try {
            reason = (JSON.parse(body) as { reason?: unknown } | null)?.reason;
          } catch {
            // not JSON: treat as not found
          }
          return Promise.reject(
            reason === 'notLoaded' ? 'not loaded' : 'not found'
          );
        }
        return Promise.reject(`HTTP ${r.status}`);
      })
      .then(j => alive && setData(historySchema.parse(j)))
      .catch(e => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [address]);

  // Each account this address has held, newest first; the view shows
  // one at a time so two accounts are never drawn as one.
  const lifetimes = useMemo(
    () => [...(data?.lifetimes ?? [])].sort((a, b) => b.lifetime - a.lifetime),
    [data]
  );
  const [pickedLifetime, setPickedLifetime] = useState<number | null>(null);
  const lifetime = pickedLifetime ?? lifetimes[0]?.lifetime ?? null;
  const rows = useMemo(
    () =>
      [...(data?.epochs ?? [])]
        .filter(r => lifetime == null || r.lifetime === lifetime)
        .sort((a, b) => a.epoch - b.epoch),
    [data, lifetime]
  );
  // Epochs its stake was at work: an inactive account still names its
  // validator (until withdrawn or delegated again) but isn't delegating.
  const working = useMemo(
    () =>
      rows.filter(r =>
        r.state ? r.state !== 'inactive' : (stakeOf(r) ?? 0) > 0
      ),
    [rows]
  );
  const runs = useMemo(() => runsOf(working), [working]);
  const latest = working[working.length - 1] ?? rows[rows.length - 1];
  // Inactive since this epoch (it stopped working before the last row).
  const inactiveFrom =
    working.length && working.length < rows.length
      ? rows.find(r => r.epoch > working[working.length - 1].epoch)?.epoch
      : undefined;
  const totalRewards = rows.reduce((a, r) => a + (rewardOf(r) ?? 0), 0);
  const auth = data?.authorities ?? [];
  const nowAuth = auth[auth.length - 1];
  const newestFirst = [...rows].reverse();
  const pages = Math.ceil(newestFirst.length / PAGE);
  const ended =
    lifetimes.find(l => l.lifetime === lifetime)?.endedBy ??
    (data?.summary?.state === 'left' ? 'left' : null);
  const state = ended
    ? ended === 'recreated'
      ? 'Closed'
      : 'Not delegated'
    : data?.summary?.state === 'left'
      ? 'Not delegated'
      : latest
        ? latest.deactivating
          ? 'Deactivating'
          : latest.activating
            ? 'Activating'
            : latest.effective
              ? 'Active'
              : 'Inactive'
        : null;

  const header = (
    <div className="page-header row g-3 align-items-start justify-content-between">
      <div className="col-auto">
        <Link to="/stake" className="d-block fs-9 mb-1">
          ← Stake Explorer
        </Link>
        <h1 className="h3 d-flex align-items-center gap-2">
          {short(address)}
          {state && (
            <span
              className={`badge badge-soft fs-10 badge-soft-${state === 'Active' ? 'success' : state === 'Inactive' || state === 'Not delegated' || state === 'Closed' ? 'secondary' : 'warning'}`}
            >
              {state}
            </span>
          )}
        </h1>
        <p className="text-body-tertiary lh-sm mb-0 mt-1">Stake account</p>
      </div>
      <div className="col-12 col-md-auto align-self-end">
        <StakeLookup compact />
      </div>
    </div>
  );

  if (error)
    return (
      <div className="mb-9">
        {header}
        <UntrackedState>
          {error === 'not found'
            ? 'No stake account at this address was delegated at the end of any recorded epoch. If it\u2019s a staker or withdrawer, look it up from the Stake Explorer.'
            : error === 'not loaded'
              ? 'Stake account histories are still loading, so this page can\u2019t show this account yet. Its delegations appear on the validator\u2019s Stake Explorer page in the meantime.'
              : error === 'no route'
                ? 'Stake history isn\u2019t served by this API yet: the Stake Explorer\u2019s data is still loading, and this page fills in once it\u2019s up.'
                : `Couldn't load this stake account (${error}).`}
        </UntrackedState>
      </div>
    );
  if (!data)
    return (
      <div className="mb-9">
        {header}
        <PageSkeleton rows={SKELETON.stakeAccount} />
      </div>
    );

  return (
    <div className="mb-9">
      {header}
      <div className="d-flex flex-column gap-3">
        <Row className="g-3">
          <Col xs={6} xl={3}>
            <StatCard
              mono={false}
              label={ended ? 'Last Stake' : 'Stake'}
              value={sol(stakeOf(latest), 0)}
              sublabel={
                latest
                  ? `epoch ${latest.epoch}${latest.activating ? ` · ${sol(latest.activating, 0)} activating` : latest.deactivating ? ` · ${sol(latest.deactivating, 0)} deactivating` : !stakeOf(latest) && latest.delegatedStake ? ` · ${sol(latest.delegatedStake, 0)} deactivated` : ''}`
                  : undefined
              }
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              label={ended ? 'Last Delegated To' : 'Delegated To'}
              mono={false}
              value={
                latest?.voteKey ? (
                  <ValidatorLink address={latest.voteKey}>
                    {latest.name ?? short(latest.voteKey)}
                  </ValidatorLink>
                ) : (
                  '—'
                )
              }
              sublabel={
                !runs.length
                  ? undefined
                  : ended
                    ? inactiveFrom != null
                      ? `until epoch ${latest?.epoch}, inactive from ${inactiveFrom}`
                      : `until epoch ${latest?.epoch}, then ${ended === 'recreated' ? 'closed' : 'left'}`
                    : `since epoch ${runs[runs.length - 1].from} · ${runs.length} validator run${runs.length === 1 ? '' : 's'}`
              }
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              mono={false}
              label="Rewards"
              value={sol(totalRewards, 2)}
              sublabel={`over ${rows.length.toLocaleString()} epochs`}
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              mono={false}
              label="First Seen"
              value={rows.length ? `${rows[0].epoch}` : '—'}
              sublabel={
                latest?.activationEpoch != null
                  ? `activated epoch ${latest.activationEpoch}`
                  : undefined
              }
            />
          </Col>
        </Row>

        {lifetimes.length > 1 && (
          <SectionCard
            title="Accounts at This Address"
            icon="refresh-cw"
            info="A stake account's address can be reused: when its account is closed (a stake pool merging its transient account, say) and a new one is opened at the same address, that's a new account. Each is shown on its own."
          >
            <p className="fs-9 text-body-secondary mb-2">
              This address has held {lifetimes.length} stake accounts in turn.
              Showing one at a time:
            </p>
            <div className="d-flex flex-wrap gap-2">
              {lifetimes.map((l, i) => (
                <Button
                  key={l.lifetime}
                  size="sm"
                  variant={
                    l.lifetime === lifetime ? 'primary' : 'soft-secondary'
                  }
                  onClick={() => {
                    setPickedLifetime(l.lifetime);
                    setPage(0);
                  }}
                >
                  {i === 0 ? 'Latest' : `Account ${l.lifetime + 1}`}
                  <span className="ms-2 opacity-75">
                    {l.from === l.to
                      ? `epoch ${l.from}`
                      : `epochs ${l.from}–${l.to}`}
                    {l.endedBy === 'recreated'
                      ? ' · closed'
                      : l.endedBy === 'left'
                        ? ' · left'
                        : ''}
                  </span>
                </Button>
              ))}
            </div>
          </SectionCard>
        )}

        <SectionCard
          title="Stake History"
          icon="trending-up"
          info="Its effective stake per epoch (line) and rewards (bars); a dashed mark where it moved to another validator. The last 100 epochs at first: drag the slider or scroll for all."
        >
          <HistoryChart rows={rows} />
        </SectionCard>

        <Row className="g-3">
          <Col xs={12} lg={7}>
            <SectionCard
              title="Validators"
              icon="server"
              info="Each run of consecutive epochs delegated to one validator, newest first: a new row is a move."
            >
              <Table responsive size="sm" className="data-table fs-9 mb-0">
                <thead>
                  <tr className="text-nowrap">
                    <th>Validator</th>
                    <th className="text-end">Epochs</th>
                    <th className="text-end">Peak Stake</th>
                    <th className="text-end">Rewards</th>
                  </tr>
                </thead>
                <tbody>
                  {[...runs].reverse().map(r => (
                    <tr key={`${r.from}-${r.voteKey}`}>
                      <td
                        className="text-truncate"
                        style={{ maxWidth: '16rem' }}
                      >
                        {r.voteKey ? (
                          <ValidatorLink address={r.voteKey}>
                            {r.name ?? short(r.voteKey)}
                          </ValidatorLink>
                        ) : (
                          <span className="text-body-tertiary">
                            Not delegated
                          </span>
                        )}
                      </td>
                      <td className="text-end text-nowrap">
                        {r.from === r.to ? r.from : `${r.from}–${r.to}`}
                      </td>
                      <td className="text-end">{sol(r.peak, 0)}</td>
                      <td className="text-end">{sol(r.rewards, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </SectionCard>
          </Col>
          <Col xs={12} lg={5}>
            <SectionCard
              title="Authorities"
              icon="key"
              info="Who can stake (delegate, move) and withdraw it, and any lockup, with each change by epoch. Early epochs' sources don't record authorities."
            >
              {nowAuth ? (
                <div className="d-flex flex-column gap-1">
                  {nowAuth.staker && (
                    <>
                      {' '}
                      <AddressLine
                        mono={false}
                        label="Staker"
                        value={nowAuth.staker}
                      />
                      <AuthorityNote
                        address={nowAuth.staker}
                        role="staker"
                        pools={pools}
                      />
                    </>
                  )}
                  {nowAuth.withdrawer && (
                    <>
                      {' '}
                      <AddressLine
                        mono={false}
                        label="Withdrawer"
                        value={nowAuth.withdrawer}
                      />
                      <AuthorityNote
                        address={nowAuth.withdrawer}
                        role="withdrawer"
                        pools={pools}
                      />
                    </>
                  )}
                  {/* The system program's address means no custodian. */}
                  {nowAuth.custodian && !/^1+$/.test(nowAuth.custodian) && (
                    <AddressLine
                      mono={false}
                      label="Custodian"
                      value={nowAuth.custodian}
                    />
                  )}
                  {nowAuth.lockup &&
                    ((nowAuth.lockup.epoch ?? NO_LOCKUP) > NO_LOCKUP ||
                      (nowAuth.lockup.unixTimestamp ?? NO_LOCKUP) >
                        NO_LOCKUP) && (
                      <div className="fs-9">
                        <span className="text-body-tertiary">Lockup </span>
                        {nowAuth.lockup.epoch
                          ? `until epoch ${nowAuth.lockup.epoch}`
                          : ''}
                        {nowAuth.lockup.unixTimestamp
                          ? ` until ${new Date(nowAuth.lockup.unixTimestamp * 1000).toISOString().slice(0, 10)}`
                          : ''}
                      </div>
                    )}
                  {auth.length > 1 && (
                    <div className="fs-10 text-body-tertiary mt-2">
                      Changed in epoch
                      {auth.length > 2 ? 's' : ''}{' '}
                      {auth
                        .slice(1)
                        .map(a => a.epoch)
                        .join(', ')}
                    </div>
                  )}
                  <a
                    className="fs-10 mt-1"
                    href={explorerAddress(address, isTestnet)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    On the explorer
                  </a>
                </div>
              ) : (
                <p className="fs-9 text-body-tertiary mb-0">
                  Not recorded for its epochs.
                </p>
              )}
            </SectionCard>
          </Col>
        </Row>

        <SectionCard
          title="By Epoch"
          icon="list"
          aside={
            pages > 1 ? (
              <div className="d-flex align-items-center gap-2 fs-9">
                <Button
                  size="sm"
                  variant="soft-secondary"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                >
                  Newer
                </Button>
                <span className="text-body-tertiary">
                  {page + 1} / {pages}
                </span>
                <Button
                  size="sm"
                  variant="soft-secondary"
                  disabled={page >= pages - 1}
                  onClick={() => setPage(p => p + 1)}
                >
                  Older
                </Button>
              </div>
            ) : undefined
          }
        >
          <Table responsive size="sm" className="data-table fs-9 mb-0">
            <thead>
              <tr className="text-nowrap">
                <th>Epoch</th>
                <th>Validator</th>
                <th className="text-end">Effective</th>
                <th className="text-end">Activating</th>
                <th className="text-end">Deactivating</th>
                <th className="text-end">Inflation Reward</th>
                <th className="text-end">Block Reward</th>
              </tr>
            </thead>
            <tbody>
              {newestFirst
                .slice(page * PAGE, (page + 1) * PAGE)
                .map((r, i, a) => {
                  const older = a[i + 1] ?? newestFirst[(page + 1) * PAGE];
                  const moved =
                    older && r.voteKey && older.voteKey !== r.voteKey;
                  return (
                    <tr
                      key={r.epoch}
                      className={moved ? 'table-warning' : undefined}
                      title={moved ? 'Moved to this validator' : undefined}
                    >
                      <td className="fw-semibold">{r.epoch}</td>
                      <td
                        className="text-truncate"
                        style={{ maxWidth: '16rem' }}
                      >
                        {r.voteKey ? (
                          <ValidatorLink address={r.voteKey}>
                            {r.name ?? short(r.voteKey)}
                          </ValidatorLink>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="text-end">{sol(r.effective, 2)}</td>
                      <td className="text-end">
                        {r.activating ? sol(r.activating, 2) : '—'}
                      </td>
                      <td className="text-end">
                        {r.deactivating ? sol(r.deactivating, 2) : '—'}
                      </td>
                      <td className="text-end">{sol(r.inflationReward, 4)}</td>
                      <td className="text-end">{sol(r.blockReward, 4)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </Table>
        </SectionCard>
      </div>
    </div>
  );
};

export default StakeAccount;
