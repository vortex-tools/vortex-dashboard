import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  TooltipComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import PageSkeleton, { SKELETON } from 'components/common/PageSkeleton';
import SectionCard from 'components/common/SectionCard';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import ValidatorLink from 'components/common/ValidatorLink';
import StakeLookup from 'components/stake/StakeLookup';
import { API_ENDPOINT } from 'helpers/apiEndpoint';
import { noPointer } from 'helpers/echart-utils';
import { formatLamports } from 'helpers/utils';
import { useAppContext } from 'providers/AppProvider';
import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  ButtonGroup,
  Col,
  Form,
  Row,
  Table,
  ToggleButton
} from 'react-bootstrap';
import { Link, useParams, useSearchParams } from 'react-router';
import { z } from 'zod';

echarts.use([
  BarChart,
  LineChart,
  DataZoomComponent,
  GridComponent,
  TooltipComponent,
  CanvasRenderer
]);

type Role = 'withdrawer' | 'staker' | 'custodian';
const ROLES: Role[] = ['withdrawer', 'staker', 'custodian'];
const ROLE_LABEL: Record<Role, string> = {
  withdrawer: 'Withdrawer',
  staker: 'Staker',
  custodian: 'Custodian'
};
const ROLE_WHAT: Record<Role, string> = {
  withdrawer: 'can withdraw from and reassign',
  staker: 'can delegate and deactivate',
  custodian: 'can lift the lockup of'
};

/** Epochs the history chart opens on (zoom out for all). */
const CHART_WINDOW = 100;
/** Accounts per page of the table. */
const LIMIT = 50;

const num = z.number().nullable().catch(null);
const holding = z.object({
  voteKey: z.string(),
  name: z.string().nullable().catch(null),
  accounts: num,
  delegatedStake: num,
  effective: num
});
// Its stake account count, stake and rewards every epoch, and where that
// stake sat (the top 10 validators and the rest).
const historySchema = z.object({
  address: z.string().optional().catch(undefined),
  role: z.string().optional().catch(undefined),
  summary: z
    .object({
      accountsEver: num,
      firstEpoch: num,
      lastEpoch: num,
      asOf: num,
      accounts: num,
      delegatedStake: num,
      effective: num
    })
    .nullable()
    .catch(null),
  epochs: z.array(
    z.object({
      epoch: z.number(),
      accounts: num,
      delegatedStake: num,
      effective: num,
      activating: num,
      deactivating: num,
      inflationReward: num,
      blockReward: num,
      byValidator: z.array(holding).catch([]),
      other: z
        .object({ accounts: num, delegatedStake: num, effective: num })
        .nullable()
        .optional()
        .catch(null)
    })
  )
});
type History = z.infer<typeof historySchema>;
type EpochRow = History['epochs'][number];
// One epoch's accounts, a page at a time.
const accountsSchema = z.object({
  epoch: z.number(),
  total: z.number().catch(0),
  nextCursor: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform(v => (v == null ? null : String(v)))
    .catch(null),
  accounts: z
    .array(
      z.object({
        stakeAccount: z.string(),
        voteKey: z.string().nullable().catch(null),
        name: z.string().nullable().catch(null),
        state: z.string().nullable().optional().catch(null),
        delegatedStake: num,
        effective: num,
        activating: num,
        deactivating: num,
        inflationReward: num,
        blockReward: num
      })
    )
    .catch([])
});
type Accounts = z.infer<typeof accountsSchema>;

const sol = (l: number | null | undefined, d = 0) =>
  l == null ? '—' : formatLamports(l, d);
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const rewardOf = (r: {
  inflationReward: number | null;
  blockReward: number | null;
}) =>
  r.inflationReward == null && r.blockReward == null
    ? null
    : (r.inflationReward ?? 0) + (r.blockReward ?? 0);
/** Stake at work: effective (including stake cooling down) plus stake
 *  warming up. */
const working = (r: { effective: number | null; activating: number | null }) =>
  (r.effective ?? 0) + (r.activating ?? 0);

const STATE: Record<string, { label: string; tone: string }> = {
  activating: { label: 'Activating', tone: 'info' },
  deactivating: { label: 'Deactivating', tone: 'warning' },
  inactive: { label: 'Inactive', tone: 'secondary' }
};

/** Its stake (line) and stake accounts (bars, right axis) every epoch. */
const HistoryChart = ({ rows }: { rows: EpochRow[] }) => {
  const { getThemeColor } = useAppContext();
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
          `<div>Stake <b>${sol(working(r))}</b></div>` +
          (r.activating ? `<div>Activating ${sol(r.activating)}</div>` : '') +
          (r.deactivating
            ? `<div>Deactivating ${sol(r.deactivating)}</div>`
            : '') +
          `<div>Stake accounts ${r.accounts?.toLocaleString() ?? '—'}</div>` +
          (rewardOf(r) != null
            ? `<div class="text-body-tertiary">Rewards ${sol(rewardOf(r), 2)}</div>`
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
      // Accounts: the bottom third, under the stake line.
      {
        type: 'value',
        max: Math.max(1, ...rows.map(r => r.accounts ?? 0)) * 3,
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
        name: 'Stake accounts',
        type: 'bar',
        yAxisIndex: 1,
        barMaxWidth: 8,
        color: getThemeColor('info'),
        itemStyle: { opacity: 0.35 },
        data: rows.map(r => r.accounts)
      },
      {
        name: 'Stake',
        type: 'line',
        step: 'end',
        symbol: rows.length === 1 ? 'circle' : 'none',
        color: getThemeColor('primary'),
        areaStyle: { opacity: 0.12 },
        data: rows.map(working)
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

/** Where its stake sat in an epoch: the top validators and the rest. */
const WhereCard = ({ row }: { row: EpochRow }) => {
  const total = row.effective ?? 0;
  const items = [
    ...row.byValidator,
    ...(row.other?.accounts ? [{ voteKey: '', name: null, ...row.other }] : [])
  ];
  return (
    <SectionCard
      title="Where Its Stake Sits"
      icon="pie-chart"
      info={`The validators its stake accounts were delegated to at the end of epoch ${row.epoch}: the ten with the most of its effective stake, then the rest together.`}
    >
      {items.length ? (
        <Table responsive size="sm" className="data-table fs-9 mb-0">
          <thead>
            <tr className="text-nowrap">
              <th>Validator</th>
              <th className="text-end">Accounts</th>
              <th className="text-end">Effective</th>
              <th className="text-end">Share</th>
            </tr>
          </thead>
          <tbody>
            {items.map(v => (
              <tr key={v.voteKey || 'other'}>
                <td className="text-truncate" style={{ maxWidth: '14rem' }}>
                  {v.voteKey ? (
                    <Link to={`/stake/vote/${v.voteKey}`}>
                      {v.name ?? short(v.voteKey)}
                    </Link>
                  ) : (
                    <span className="text-body-tertiary">Other validators</span>
                  )}
                </td>
                <td className="text-end">
                  {v.accounts?.toLocaleString() ?? '—'}
                </td>
                <td className="text-end text-nowrap">{sol(v.effective)}</td>
                <td className="text-end">
                  {total && v.effective != null
                    ? `${((v.effective / total) * 100).toFixed(1)}%`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p className="fs-9 text-body-tertiary mb-0">
          None of its stake accounts were delegated then.
        </p>
      )}
    </SectionCard>
  );
};

/** The stake accounts it held a role on in one epoch, 50 at a time. */
const AccountsCard = ({
  address,
  role,
  epochs
}: {
  address: string;
  role: Role;
  epochs: number[];
}) => {
  const [epoch, setEpoch] = useState(epochs[0]);
  const [sort, setSort] = useState<'effective' | 'rewards'>('effective');
  const [pages, setPages] = useState<Accounts[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = (cursor: string | null) => {
    const q = new URLSearchParams({
      address,
      role,
      epoch: String(epoch),
      sort,
      dir: 'desc',
      limit: String(LIMIT),
      ...(cursor ? { cursor } : {})
    });
    return fetch(`${API_ENDPOINT}/stake/authority?${q}`)
      .then(r => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then(j => accountsSchema.parse(j));
  };
  useEffect(() => {
    let alive = true;
    setPages([]);
    setError(null);
    load(null).then(
      p => alive && setPages([p]),
      e => alive && setError(String(e))
    );
    return () => {
      alive = false;
    };
    // (load reads these.)
  }, [address, role, epoch, sort]);
  const rows = pages.flatMap(p => p.accounts);
  const next = pages[pages.length - 1]?.nextCursor ?? null;
  const total = pages[0]?.total ?? null;
  return (
    <SectionCard
      title="Stake Accounts"
      icon="layers"
      info={`Every stake account it was the ${ROLE_LABEL[role].toLowerCase()} of at the end of the epoch you pick: the validator it was delegated to, its stake and rewards. Sorted by the API, 50 at a time.`}
    >
      <Row className="g-2 mb-2">
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
            onChange={e => setSort(e.target.value as typeof sort)}
            aria-label="Sort"
          >
            <option value="effective">By stake</option>
            <option value="rewards">By rewards</option>
          </Form.Select>
        </Col>
      </Row>
      {error ? (
        <p className="fs-9 text-body-tertiary mb-0">
          Couldn&apos;t load its stake accounts ({error}).
        </p>
      ) : (
        <>
          <Table responsive size="sm" className="data-table fs-9 mb-0">
            <thead>
              <tr className="text-nowrap">
                <th>Stake Account</th>
                <th>Validator</th>
                <th className="text-end">Effective</th>
                <th className="text-end">Activating</th>
                <th className="text-end">Deactivating</th>
                <th className="text-end">Rewards</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(a => {
                const st = a.state ? STATE[a.state] : null;
                return (
                  <tr key={a.stakeAccount}>
                    <td className="text-nowrap">
                      <Link to={`/stake/account/${a.stakeAccount}`}>
                        {short(a.stakeAccount)}
                      </Link>
                      {st && (
                        <span
                          className={`badge badge-soft badge-soft-${st.tone} ms-2`}
                        >
                          {st.label}
                        </span>
                      )}
                    </td>
                    <td className="text-truncate" style={{ maxWidth: '14rem' }}>
                      {a.voteKey ? (
                        <ValidatorLink address={a.voteKey}>
                          {a.name ?? short(a.voteKey)}
                        </ValidatorLink>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-end text-nowrap">
                      {sol(a.effective, 2)}
                    </td>
                    <td className="text-end text-nowrap">
                      {a.activating ? sol(a.activating, 2) : '—'}
                    </td>
                    <td className="text-end text-nowrap">
                      {a.deactivating ? sol(a.deactivating, 2) : '—'}
                    </td>
                    <td className="text-end text-nowrap">
                      {sol(rewardOf(a), 4)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <div className="d-flex align-items-center justify-content-between mt-2 fs-9 text-body-tertiary">
            <span>
              {total != null
                ? `${rows.length.toLocaleString()} of ${total.toLocaleString()}`
                : 'Loading…'}
            </span>
            {next && (
              <Button
                size="sm"
                variant="soft-secondary"
                disabled={loading}
                onClick={() => {
                  setLoading(true);
                  load(next)
                    .then(
                      p => setPages(ps => [...ps, p]),
                      e => setError(String(e))
                    )
                    .finally(() => setLoading(false));
                }}
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

/**
 * A staker, withdrawer or custodian in the Stake explorer
 * (/stake/authority/:address?role=): how many stake accounts it controlled
 * and their stake every epoch, where that stake sat, and the accounts
 * themselves, from /stake/authority/history (one request) and
 * /stake/authority (a page at a time). An address with more than one role
 * switches between them. Staging only for now.
 */
const StakeAuthority = () => {
  const { address = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const asked = params.get('role');
  const role: Role = (ROLES as string[]).includes(asked ?? '')
    ? (asked as Role)
    : 'withdrawer';
  // Its other roles (from /stake/resolve), for the switch.
  const [roles, setRoles] = useState<Role[]>([]);
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(
      `${API_ENDPOINT}/stake/resolve?address=${encodeURIComponent(address)}`
    )
      .then(r => (r.ok ? r.json() : null))
      .then((j: { kinds?: string[] } | null) => {
        if (alive) setRoles(ROLES.filter(r => j?.kinds?.includes(r)));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [address]);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    fetch(
      `${API_ENDPOINT}/stake/authority/history?address=${encodeURIComponent(address)}&role=${role}`
    )
      .then(async r => {
        if (r.ok) return r.json();
        if (r.status === 404) {
          const body = (await r.text()).trim();
          if (!body) return Promise.reject('no route');
          let reason: unknown = null;
          try {
            reason = (JSON.parse(body) as { reason?: unknown } | null)?.reason;
          } catch {
            // not JSON
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
  }, [address, role]);

  const rows = useMemo(
    () => [...(data?.epochs ?? [])].sort((a, b) => a.epoch - b.epoch),
    [data]
  );
  const latest = rows[rows.length - 1];
  const s = data?.summary;
  const totalRewards = rows.reduce((a, r) => a + (rewardOf(r) ?? 0), 0);
  const newestFirst = useMemo(
    () => [...rows].reverse().map(r => r.epoch),
    [rows]
  );

  const header = (
    <div className="page-header row g-3 align-items-start justify-content-between">
      <div className="col-auto">
        <Link to="/stake" className="d-block fs-9 mb-1">
          ← Stake Explorer
        </Link>
        <h1 className="h3">{short(address)}</h1>
        <p className="text-body-tertiary lh-sm mb-0 mt-1">
          {ROLE_LABEL[role]} of stake accounts
        </p>
      </div>
      <div className="col-12 col-md-auto align-self-end d-flex flex-column align-items-md-end gap-2">
        {roles.length > 1 && (
          <ButtonGroup size="sm">
            {roles.map(r => (
              <ToggleButton
                key={r}
                id={`role-${r}`}
                type="radio"
                name="role"
                variant="soft-secondary"
                value={r}
                checked={role === r}
                onChange={() =>
                  setParams(
                    p => {
                      const n = new URLSearchParams(p);
                      n.set('role', r);
                      return n;
                    },
                    { replace: true }
                  )
                }
              >
                {ROLE_LABEL[r]}
              </ToggleButton>
            ))}
          </ButtonGroup>
        )}
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
            ? `This address isn’t the ${ROLE_LABEL[role].toLowerCase()} of any stake account in the recorded epochs.`
            : error === 'not loaded'
              ? 'Staker and withdrawer histories are still loading; this page fills in once they’re up.'
              : error === 'no route'
                ? 'Staker and withdrawer histories aren’t served by this API yet.'
                : `Couldn't load this address (${error}).`}
        </UntrackedState>
      </div>
    );
  if (!data)
    return (
      <div className="mb-9">
        {header}
        <PageSkeleton rows={SKELETON.stakeAuthority} />
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
              label="Stake Accounts"
              value={(s?.accounts ?? latest?.accounts)?.toLocaleString() ?? '—'}
              sublabel={
                s?.accountsEver != null
                  ? `${s.accountsEver.toLocaleString()} ever`
                  : undefined
              }
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              mono={false}
              label="Stake"
              value={latest ? sol(working(latest)) : '—'}
              sublabel={latest ? `epoch ${latest.epoch}` : undefined}
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
              value={
                s?.firstEpoch != null
                  ? String(s.firstEpoch)
                  : rows[0]
                    ? String(rows[0].epoch)
                    : '—'
              }
              sublabel={`as ${ROLE_LABEL[role].toLowerCase()}`}
            />
          </Col>
        </Row>
        <p className="fs-9 text-body-secondary mb-0">
          The {ROLE_LABEL[role].toLowerCase()} {ROLE_WHAT[role]} the stake
          accounts that name it.
        </p>

        <SectionCard
          title="Stake History"
          icon="trending-up"
          info="Its stake accounts' stake every epoch (line: effective plus activating) and how many accounts it held the role on (bars). Zoom out with the slider for its whole history."
        >
          <HistoryChart rows={rows} />
        </SectionCard>

        {latest && <WhereCard row={latest} />}

        {newestFirst.length > 0 && (
          <AccountsCard address={address} role={role} epochs={newestFirst} />
        )}
      </div>
    </div>
  );
};

export default StakeAuthority;
