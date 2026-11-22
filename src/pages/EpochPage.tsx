import FeatherIcon from 'components/base/FeatherIcon';
import { CHANGE_KIND } from 'components/changes/changes';
import PageSkeleton, { SKELETON } from 'components/common/PageSkeleton';
import SectionCard from 'components/common/SectionCard';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import ValidatorLink from 'components/common/ValidatorLink';
import { MAINNET_ACTIVATION_EPOCH } from 'helpers/alpenglowClient';
import { API_ENDPOINT, IS_STAGING } from 'helpers/apiEndpoint';
import {
  EpochRow,
  blockIncome,
  epochRowSchema,
  skipRate
} from 'helpers/epochRow';
import { formatLamports } from 'helpers/utils';
import { FEATURES_KEY, VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Col, Row, Table } from 'react-bootstrap';
import { Link, useParams } from 'react-router';
import { z } from 'zod';

const num = z.number().nullable().catch(null);
// The epoch's frozen stake set (/epochs/stakes): every staked vote account.
const stakesSchema = z.object({
  epoch: z.number(),
  totalStake: z.number(),
  delegationsComplete: z.boolean().catch(false),
  voteAccounts: z.array(
    z.object({
      voteKey: z.string(),
      identity: z.string().nullable().catch(null),
      leaderScheduleStake: z.number().catch(0),
      inflationCommissionBps: num,
      delegations: num,
      stakerInflationRewards: num
    })
  )
});
type Stakes = z.infer<typeof stakesSchema>;
const activitySchema = z.object({
  events: z
    .array(z.object({ kind: z.string().catch('other') }).passthrough())
    .catch([])
});

/** Largest validators listed. */
const TOP = 10;

const sol = (l: number | null | undefined, d = 0) =>
  l == null ? '—' : formatLamports(l, d);
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** The fewest validators holding more than a third of the stake (enough to
 *  halt consensus). */
const nakamoto = (stakes: number[], total: number) => {
  let sum = 0;
  const sorted = [...stakes].sort((a, b) => b - a);
  for (let i = 0; i < sorted.length; i++) {
    sum += sorted[i];
    if (sum > total / 3) return i + 1;
  }
  return null;
};

const getJson = async <T,>(path: string, schema: z.ZodType<T>) => {
  const r = await fetch(`${API_ENDPOINT}${path}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return schema.parse(await r.json());
};

const date = (t: number | null) =>
  t == null
    ? '—'
    : new Date(t * 1000).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC'
      }) + ' UTC';
const duration = (a: number | null, b: number | null) => {
  if (a == null || b == null) return null;
  const h = (b - a) / 3600;
  return h >= 48 ? `${(h / 24).toFixed(1)} days` : `${h.toFixed(1)} hours`;
};
/** A length of time, in its largest sensible unit. */
const span = (secs: number) =>
  secs >= 3600
    ? `${(secs / 3600).toFixed(1)} h`
    : secs >= 60
      ? `${Math.round(secs / 60)} min`
      : `${Math.round(secs)} s`;

/** "none", "1 (4.8 h in all)", "2 restarts". */
const haltSummary = (halts: NonNullable<EpochRow['halts']>) => {
  if (!halts.length) return 'none';
  const restarts = halts.filter(h => h.kind === 'restart').length;
  const secs = halts.reduce((a, h) => a + (h.durationSeconds ?? 0), 0);
  return restarts === halts.length
    ? `${restarts} restart${restarts === 1 ? '' : 's'}`
    : `${halts.length}${secs ? ` (${span(secs)} in all)` : ''}`;
};

/** The epoch's halts: a TowerBFT gap's times and length, or an
 *  Alpenglow restart's slot, and the restart announcement matched. */
const HaltsCard = ({ halts }: { halts: NonNullable<EpochRow['halts']> }) => (
  <SectionCard
    title="Halts"
    icon="alert-octagon"
    info="TowerBFT epochs: every stretch of a minute or more without a block, with its times. Alpenglow epochs: cluster restarts, at their hard-fork slot (Alpenglow block times are each producer's own and run on through a restart, so a restart has no measured length). Each with the restart announcement that matched it."
  >
    <Table responsive size="sm" className="data-table fs-9 mb-0">
      <thead>
        <tr className="text-nowrap">
          <th>Kind</th>
          <th>Stopped</th>
          <th className="text-end">Length</th>
          <th className="text-end">Last Block</th>
          <th className="text-end">Restart Slot</th>
          <th className="text-end">Next Block</th>
          <th>Announcement</th>
        </tr>
      </thead>
      <tbody>
        {halts.map((h, i) => (
          <tr key={`${h.lastBlockSlot}-${i}`}>
            <td className="text-nowrap">
              {h.kind === 'restart' ? 'Cluster restart' : 'No blocks'}
            </td>
            <td className="text-nowrap">{date(h.startTime)}</td>
            <td className="text-end text-nowrap">
              {h.durationSeconds == null ? '—' : span(h.durationSeconds)}
            </td>
            <td className="text-end">
              {h.lastBlockSlot == null ? (
                '—'
              ) : (
                <Link to={`/slot/${h.lastBlockSlot}`}>
                  {h.lastBlockSlot.toLocaleString()}
                </Link>
              )}
            </td>
            <td className="text-end">
              {h.restartSlot == null ? (
                '—'
              ) : (
                <Link to={`/slot/${h.restartSlot}`}>
                  {h.restartSlot.toLocaleString()}
                </Link>
              )}
            </td>
            <td className="text-end">
              {h.nextBlockSlot == null ? (
                '—'
              ) : (
                <Link to={`/slot/${h.nextBlockSlot}`}>
                  {h.nextBlockSlot.toLocaleString()}
                </Link>
              )}
            </td>
            <td>
              {h.announcement?.url ? (
                <a href={h.announcement.url} target="_blank" rel="noreferrer">
                  Restart post
                </a>
              ) : (
                <span className="text-body-tertiary">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  </SectionCard>
);

// The API's rate: a fraction, or a percent if over 1.
const ratePct = (r: number | null) =>
  r == null ? null : `${(r > 1 ? r : r * 100).toFixed(2)}%`;

/** The epoch's own figures (/epoch): when it ran, its slots and blocks,
 *  what its leaders took in, how stake moved, and supply. Each figure
 *  shows once the API has it. */
const EpochFacts = ({ row }: { row: EpochRow }) => {
  const income = blockIncome(row);
  const skip = skipRate(row);
  const ratio =
    row.capitalization && row.totalStake != null
      ? row.totalStake / row.capitalization
      : null;
  const groups: Array<{
    title: string;
    items: Array<[string, string | null, string?]>;
  }> = [
    {
      title: 'When',
      items: [
        ['Started', date(row.startTime)],
        [
          'Ended',
          row.complete ? date(row.endTime) : 'in progress',
          duration(row.startTime, row.endTime) ?? undefined
        ],
        [
          'Slots',
          row.firstSlot != null && row.lastSlot != null
            ? `${row.firstSlot.toLocaleString()} – ${row.lastSlot.toLocaleString()}`
            : null
        ]
      ]
    },
    {
      title: 'Blocks',
      items: [
        ['Blocks', row.blocks?.toLocaleString() ?? null],
        [
          'Halts',
          row.halts == null ? null : haltSummary(row.halts),
          row.halts == null
            ? undefined
            : row.consensus === 'alpenglow'
              ? 'cluster restarts'
              : 'a minute or more without a block'
        ],
        [
          'Skipped slots',
          row.skippedSlots?.toLocaleString() ?? null,
          skip != null ? `${pct(skip, 2)} skip rate` : undefined
        ],
        [
          'Fees and tips',
          income != null ? sol(income) : null,
          income != null
            ? `fees ${sol((row.baseFees ?? 0) + (row.priorityFees ?? 0))} · tips ${sol(row.mevTips)}`
            : undefined
        ]
      ]
    },
    {
      title: 'Stake',
      items: [
        [
          'Effective',
          row.effectiveStake != null ? sol(row.effectiveStake) : null
        ],
        [
          'Activating',
          row.activatingStake != null ? sol(row.activatingStake) : null
        ],
        [
          'Deactivating',
          row.deactivatingStake != null ? sol(row.deactivatingStake) : null
        ],
        [
          'Validators joined / left',
          row.joined != null || row.left != null
            ? `+${row.joined ?? 0} / −${row.left ?? 0}`
            : null
        ]
      ]
    },
    {
      title: 'Supply',
      items: [
        [
          'Capitalization',
          row.capitalization != null ? sol(row.capitalization) : null,
          'total SOL supply'
        ],
        ['Staked', ratio != null ? pct(ratio) : null, 'of supply'],
        ['Inflation rate', ratePct(row.inflationRate), 'annual'],
        [
          'Inflation rewards',
          row.inflationBudget != null ? sol(row.inflationBudget) : null,
          row.inflationBudget != null &&
          (row.stakerInflationRewards != null ||
            row.validatorInflationRewards != null)
            ? `stakers ${sol(row.stakerInflationRewards)} · commission ${sol(row.validatorInflationRewards)}`
            : undefined
        ],
        [
          'Block rewards to stakers',
          row.stakerBlockRewards != null ? sol(row.stakerBlockRewards) : null
        ]
      ]
    }
  ];
  const shown = groups
    .map(g => ({ ...g, items: g.items.filter(i => i[1] != null) }))
    .filter(g => g.items.length);
  if (!shown.length) return null;
  return (
    <SectionCard title="This Epoch" icon="clock">
      <Row className="g-3">
        {shown.map(g => (
          <Col key={g.title} xs={12} sm={6} xl={3}>
            <div className="fs-10 text-uppercase fw-bold text-body-tertiary mb-2">
              {g.title}
            </div>
            <dl className="mb-0 fs-9">
              {g.items.map(([k, v, sub]) => (
                <div key={k} className="mb-2">
                  <dt className="fw-normal text-body-tertiary">{k}</dt>
                  <dd className="mb-0 fw-semibold">
                    {v}
                    {sub && (
                      <span className="fw-normal text-body-tertiary fs-10 ms-1">
                        {sub}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Col>
        ))}
      </Row>
    </SectionCard>
  );
};

/** Previous / next epoch, around the title. */
const EpochNav = ({ epoch, current }: { epoch: number; current: number }) => (
  <div className="d-flex align-items-center gap-1 fs-9">
    {epoch > 0 ? (
      <Link
        to={`/epoch/${epoch - 1}`}
        className="btn btn-sm btn-soft-secondary"
      >
        <FeatherIcon icon="chevron-left" size={14} /> {epoch - 1}
      </Link>
    ) : null}
    <Link to="/epoch" className="btn btn-sm btn-soft-secondary">
      All epochs
    </Link>
    {epoch < current ? (
      <Link
        to={`/epoch/${epoch + 1}`}
        className="btn btn-sm btn-soft-secondary"
      >
        {epoch + 1} <FeatherIcon icon="chevron-right" size={14} />
      </Link>
    ) : null}
  </div>
);

/**
 * One epoch (/epoch/:epoch), fixed once it ends so its numbers can be
 * cited: its stake set (total, validators, Nakamoto coefficient, the
 * largest validators, what stakers were paid), the feature gates it
 * activated, its validators' activity, and links to its leaderboards.
 * The boundary facts (slots and times, capitalization, inflation, blocks
 * and fees) come with the API's /epoch. Staging only for now.
 */
const EpochPage = () => {
  const { epoch: param = '' } = useParams();
  const epoch = /^\d+$/.test(param) ? Number(param) : null;
  const context = useContext(VortexDataContext);
  const current = context?.currentEpochState.epoch ?? null;
  const directory = context?.validatorDirectoryState.byVoteAddress;
  const fetchFeatures = context?.featuresState.fetchData;
  const features = context?.featuresState.data.get(FEATURES_KEY);
  const [stakes, setStakes] = useState<Stakes | null | undefined>(undefined);
  const [events, setEvents] = useState<Array<{ kind: string }> | null>(null);
  // undefined while loading; null: the API has no /epoch (yet) or not
  // this epoch.
  const [row, setRow] = useState<EpochRow | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFeatures?.(FEATURES_KEY);
  }, [fetchFeatures]);
  useEffect(() => {
    if (epoch == null) return;
    let alive = true;
    setStakes(undefined);
    setEvents(null);
    setRow(undefined);
    setError(null);
    getJson(`/epoch?epoch=${epoch}`, epochRowSchema).then(
      r => alive && setRow(r),
      () => alive && setRow(null)
    );
    getJson(`/epochs/stakes?epoch=${epoch}`, stakesSchema).then(
      s => alive && setStakes(s),
      e => alive && setError(String(e))
    );
    getJson(`/cluster/activity?epoch=${epoch}`, activitySchema).then(
      a => alive && setEvents(a?.events ?? []),
      () => alive && setEvents([])
    );
    return () => {
      alive = false;
    };
  }, [epoch]);

  const ranked = useMemo(
    () =>
      [...(stakes?.voteAccounts ?? [])]
        .filter(v => v.leaderScheduleStake > 0)
        .sort((a, b) => b.leaderScheduleStake - a.leaderScheduleStake),
    [stakes]
  );
  const total = stakes?.totalStake ?? row?.totalStake ?? 0;
  const nak = useMemo(
    () =>
      total
        ? nakamoto(
            ranked.map(v => v.leaderScheduleStake),
            total
          )
        : null,
    [ranked, total]
  );
  const stakerRewards =
    row?.stakerInflationRewards ??
    (stakes?.delegationsComplete
      ? ranked.reduce((a, v) => a + (v.stakerInflationRewards ?? 0), 0)
      : null);
  const activated = useMemo(
    () =>
      (features?.features ?? []).filter(
        f =>
          f.clusters['mainnet-beta']?.status === 'active' &&
          f.clusters['mainnet-beta']?.epoch === epoch
      ),
    [features, epoch]
  );
  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events ?? []) m.set(e.kind, (m.get(e.kind) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [events]);

  const alpenglow = epoch != null && epoch >= MAINNET_ACTIVATION_EPOCH;
  const inProgress = epoch != null && current != null && epoch === current;
  const header = (
    <div className="page-header row g-3 align-items-start justify-content-between">
      <div className="col-auto">
        <h1 className="h3 d-flex align-items-center gap-2">
          Epoch {epoch ?? param}
          {inProgress && (
            <span className="badge badge-soft badge-soft-warning fs-10">
              In progress
            </span>
          )}
        </h1>
        <p className="text-body-tertiary lh-sm mb-0 mt-1">
          {epoch == null
            ? ''
            : `${alpenglow ? 'Alpenglow' : 'TowerBFT'} consensus${
                row?.startTime
                  ? ` · ${new Date(row.startTime * 1000).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' })}${
                      row.endTime
                        ? ` – ${new Date(row.endTime * 1000).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' })}`
                        : ''
                    }`
                  : ''
              }`}
        </p>
      </div>
      {epoch != null && current != null && (
        <div className="col-auto align-self-center">
          <EpochNav epoch={epoch} current={current} />
        </div>
      )}
    </div>
  );

  if (epoch == null || (current != null && epoch > current))
    return (
      <div className="mb-9">
        {header}
        <UntrackedState>
          {epoch == null
            ? 'That isn’t an epoch number.'
            : `Epoch ${epoch} hasn’t started yet: the current epoch is ${current}.`}
        </UntrackedState>
      </div>
    );
  // The page stands on either source: the stake set or the epoch's row.
  if (error || (stakes === null && row === null))
    return (
      <div className="mb-9">
        {header}
        <UntrackedState>
          {error
            ? `Couldn't load epoch ${epoch} (${error}).`
            : `Nothing is recorded for epoch ${epoch} yet.`}
        </UntrackedState>
      </div>
    );
  if (stakes === undefined || row === undefined)
    return (
      <div className="mb-9">
        {header}
        <PageSkeleton rows={SKELETON.epochPage} />
      </div>
    );

  const links = [
    { label: 'Voting leaderboard', to: `/leaderboards/voting/epoch/${epoch}` },
    ...(alpenglow
      ? [
          {
            label: 'Consensus leaderboard',
            to: `/leaderboards/consensus/epoch/${epoch}`
          }
        ]
      : []),
    ...(IS_STAGING && epoch >= 1066
      ? [{ label: 'Block builders', to: `/block-builders/epoch/${epoch}` }]
      : [])
  ];

  return (
    <div className="mb-9">
      {header}
      <div className="d-flex flex-column gap-3">
        <Row className="g-3">
          <Col xs={6} xl={3}>
            <StatCard
              mono={false}
              label="Total Stake"
              value={total ? sol(total) : '—'}
              sublabel="frozen into the leader schedule"
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              mono={false}
              label="Staked Validators"
              value={
                stakes
                  ? ranked.length.toLocaleString()
                  : (row?.stakedValidators?.toLocaleString() ?? '—')
              }
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              mono={false}
              label="Nakamoto Coefficient"
              value={nak == null ? '—' : String(nak)}
              sublabel="fewest validators holding over 1/3 of stake"
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              mono={false}
              label="Paid to Stakers"
              value={sol(stakerRewards)}
              sublabel={
                stakerRewards == null
                  ? inProgress
                    ? 'paid at the epoch’s end'
                    : 'not loaded yet'
                  : 'inflation rewards, after commission'
              }
            />
          </Col>
        </Row>

        {row && <EpochFacts row={row} />}
        {!!row?.halts?.length && <HaltsCard halts={row.halts} />}
        <SectionCard
          title="Largest Validators"
          icon="server"
          info={`The ${TOP} vote accounts with the most stake in this epoch's leader schedule, with their share of all stake and their inflation commission as frozen.`}
        >
          {!stakes ? (
            <p className="fs-9 text-body-tertiary mb-0">
              This epoch&apos;s stake set isn&apos;t recorded yet.
            </p>
          ) : (
            <Table responsive size="sm" className="data-table fs-9 mb-0">
              <thead>
                <tr className="text-nowrap">
                  <th className="text-end">#</th>
                  <th>Validator</th>
                  <th className="text-end">Stake</th>
                  <th className="text-end">Share</th>
                  <th className="text-end">Commission</th>
                </tr>
              </thead>
              <tbody>
                {ranked.slice(0, TOP).map((v, i) => (
                  <tr key={v.voteKey}>
                    <td className="text-end text-body-tertiary">{i + 1}</td>
                    <td className="text-truncate" style={{ maxWidth: '16rem' }}>
                      <ValidatorLink address={v.voteKey}>
                        {directory?.get(v.voteKey)?.name ?? short(v.voteKey)}
                      </ValidatorLink>
                    </td>
                    <td className="text-end text-nowrap">
                      {sol(v.leaderScheduleStake)}
                    </td>
                    <td className="text-end">
                      {total ? pct(v.leaderScheduleStake / total, 2) : '—'}
                    </td>
                    <td className="text-end">
                      {v.inflationCommissionBps == null
                        ? '—'
                        : `${v.inflationCommissionBps / 100}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </SectionCard>

        <Row className="g-3">
          <Col xs={12} md={4}>
            <SectionCard title="Feature Gates Activated" icon="toggle-right">
              {!features ? (
                <p className="fs-9 text-body-tertiary mb-0">Loading…</p>
              ) : activated.length ? (
                <ul className="list-unstyled fs-9 mb-0 d-flex flex-column gap-1">
                  {activated.map(f => (
                    <li key={f.id}>
                      <Link to={`/feature/${f.id}`}>
                        {f.title ?? f.name ?? f.id}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="fs-9 text-body-tertiary mb-0">
                  None activated on mainnet in this epoch.
                </p>
              )}
            </SectionCard>
          </Col>
          <Col xs={12} md={4}>
            <SectionCard
              title="Validator Activity"
              icon="activity"
              info="Key, commission and collector changes, identity withdrawals, failovers, migrations and software changes recorded in this epoch."
            >
              {events == null ? (
                <p className="fs-9 text-body-tertiary mb-0">Loading…</p>
              ) : kinds.length ? (
                <ul className="list-unstyled fs-9 mb-0 d-flex flex-column gap-1">
                  {kinds.map(([k, n]) => (
                    <li key={k} className="d-flex justify-content-between">
                      <span>{CHANGE_KIND[k]?.label ?? k}</span>
                      <span className="text-body-tertiary">
                        {n.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="fs-9 text-body-tertiary mb-0">
                  None recorded for this epoch.
                </p>
              )}
            </SectionCard>
          </Col>
          <Col xs={12} md={4}>
            <SectionCard title="Leaderboards" icon="award">
              <div className="d-flex flex-wrap gap-2">
                {links.map(l => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="btn btn-sm btn-soft-primary"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </SectionCard>
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default EpochPage;
