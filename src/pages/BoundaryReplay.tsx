import PageSkeleton, { SKELETON } from 'components/common/PageSkeleton';
import SectionCard from 'components/common/SectionCard';
import SlotNumber from 'components/common/SlotNumber';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import WarningBanner from 'components/common/WarningBanner';
import { API_ENDPOINT } from 'helpers/apiEndpoint';
import { timeAgo } from 'helpers/utils';
import { useEffect, useMemo, useState } from 'react';
import { Col, Row, Table } from 'react-bootstrap';
import { z } from 'zod';

/** Where the page reads vortex-replay's boundary status (served by the
 *  API from gs://vortex-mainnet/calibration/status/boundary-status.json). */
const STATUS_PATH = '/replay/boundary-status';
/** The file is rewritten every 15 minutes; older than this, it's stalled. */
const STALE_S = 30 * 60;
/** The file is rewritten every 15 minutes: read it again this often. */
const REFRESH_MS = 60_000;
/** Grid cells per row. */
const PER_ROW = 40;

const STATUSES = [
  'done',
  'running',
  'queued',
  'failed',
  'not-started'
] as const;
type Status = (typeof STATUSES)[number];

const rowSchema = z.object({
  epoch: z.number(),
  status: z.enum(STATUSES).catch('not-started'),
  source: z.string().nullable().optional().catch(null),
  updated: z.string().nullable().optional().catch(null),
  runner: z.string().nullable().optional().catch(null),
  stage: z.string().nullable().optional().catch(null),
  heartbeat: z.string().nullable().optional().catch(null),
  progress: z
    .object({ slot: z.number(), target: z.number() })
    .nullable()
    .optional()
    .catch(null),
  failure: z.string().nullable().optional().catch(null),
  last_bank: z.number().nullable().optional().catch(null),
  first_bank: z.number().nullable().optional().catch(null),
  last_hash: z.string().nullable().optional().catch(null),
  first_hash: z.string().nullable().optional().catch(null),
  checks: z
    .union([z.array(z.string()), z.string()])
    .nullable()
    .optional()
    .catch(null),
  version: z.string().nullable().optional().catch(null),
  ledger_source: z.string().nullable().optional().catch(null),
  seconds: z.number().nullable().optional().catch(null)
});
type BoundaryRow = z.infer<typeof rowSchema>;
// epoch-stakes' history store: a delta for every adjacent pair of
// epochs it covers, keyframes, the pairs still missing (and those whose
// seam is pending), as "E-E+1".
const histSchema = z.object({
  deltas: z.number().catch(0),
  pairs: z.number().catch(0),
  keyframes: z.array(z.number()).catch([]),
  missing: z.array(z.string()).catch([]),
  pending_seams: z.array(z.string()).catch([])
});
type Hist = z.infer<typeof histSchema>;
const statusSchema = z.object({
  generated: z.string().nullable().catch(null),
  last_epoch: z.number(),
  hist: histSchema.nullable().optional().catch(null),
  counts: z.record(z.string(), z.number()).catch({}),
  epochs: z.array(rowSchema)
});
type BoundaryStatus = z.infer<typeof statusSchema>;

/** Each status's name and color (a CSS color: grid cells and legend). */
const STATUS: Record<Status, { label: string; color: string }> = {
  done: { label: 'Done', color: 'var(--vx-success)' },
  running: { label: 'Running', color: 'var(--vx-info)' },
  queued: { label: 'Queued', color: 'var(--vx-warning-border-subtle)' },
  failed: { label: 'Failed', color: 'var(--vx-danger)' },
  'not-started': { label: 'Not started', color: 'var(--vx-body-highlight-bg)' }
};

const unixOf = (iso: string | null | undefined) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t / 1000;
};
const ago = (iso: string | null | undefined) => {
  const t = unixOf(iso);
  return t == null ? '—' : timeAgo(t);
};
const checksText = (c: BoundaryRow['checks']) =>
  c == null ? null : Array.isArray(c) ? c.join(', ') : c;
/** Its progress as vortex-replay reports it: the slot reached and the
 *  slot it's replaying to (not a fraction - the slot can be 0 before it
 *  starts, or the target itself at a stage's end). */
const progressText = (r: BoundaryRow) =>
  r.progress
    ? r.progress.slot === r.progress.target
      ? `at ${r.progress.target.toLocaleString('en-US')}`
      : `${r.progress.slot ? r.progress.slot.toLocaleString('en-US') : 'not started'} → ${r.progress.target.toLocaleString('en-US')}`
    : null;

/** One epoch's hover text: its status and what's known. */
const titleOf = (r: BoundaryRow) =>
  [
    `Epoch ${r.epoch} boundary: ${STATUS[r.status].label}`,
    r.runner && `on ${r.runner}`,
    r.stage && `stage ${r.stage}`,
    progressText(r) && `slot ${progressText(r)}`,
    r.failure && r.failure.slice(0, 120),
    r.version && `agave ${r.version}`
  ]
    .filter(Boolean)
    .join(' · ');

/** "E-E+1" pairs as runs of consecutive pairs: "818-1079" for 818-819
 *  up to 1078-1079. */
const pairRuns = (pairs: string[]) => {
  const firsts = pairs
    .map(p => Number(p.split('-')[0]))
    .filter(n => !Number.isNaN(n))
    .sort((a, b) => a - b);
  const runs: Array<[number, number]> = [];
  for (const e of firsts) {
    const last = runs[runs.length - 1];
    if (last && e === last[1]) last[1] = e + 1;
    else runs.push([e, e + 1]);
  }
  return runs;
};
const runsText = (pairs: string[]) =>
  pairRuns(pairs)
    .map(([a, b]) =>
      b - a === 1 ? `${a}-${b}` : `${a}-${b} (${(b - a).toLocaleString()})`
    )
    .join(', ');

/** epoch-stakes' history store: how many of its adjacent-epoch deltas
 *  exist, its keyframes, and what's missing or pending. */
const HistCard = ({ h }: { h: Hist }) => (
  <SectionCard
    title="Stake History Store"
    icon="layers"
    info="epoch-stakes' history store: every adjacent pair of epochs it covers needs a delta; keyframes are full snapshots. Missing: pairs with no delta yet (runs of consecutive pairs as first-last epoch, with their count). Pending seams: pairs waiting on a seam."
  >
    <div className="fs-9 d-flex flex-column gap-2">
      <div>
        <span className="fw-semibold">
          {h.deltas.toLocaleString()} of {h.pairs.toLocaleString()}
        </span>{' '}
        deltas
        {h.pairs > 0 && (
          <span className="text-body-tertiary">
            {' '}
            ({((h.deltas / h.pairs) * 100).toFixed(0)}%)
          </span>
        )}
        <div
          className="mt-1 rounded bg-body-highlight overflow-hidden"
          style={{ height: 6 }}
        >
          <div
            className="h-100 bg-success"
            style={{ width: `${h.pairs ? (h.deltas / h.pairs) * 100 : 0}%` }}
          />
        </div>
      </div>
      <div>
        <span className="text-body-tertiary">Keyframes </span>
        {h.keyframes.length ? h.keyframes.join(', ') : 'none'}
      </div>
      <div>
        <span className="text-body-tertiary">
          Missing ({h.missing.length.toLocaleString()}){' '}
        </span>
        {h.missing.length ? runsText(h.missing) : 'none'}
      </div>
      <div>
        <span className="text-body-tertiary">
          Pending seams ({h.pending_seams.length.toLocaleString()}){' '}
        </span>
        {h.pending_seams.length ? runsText(h.pending_seams) : 'none'}
      </div>
    </div>
  </SectionCard>
);

/** A boundary's details: what vortex-replay recorded for it. */
const Details = ({ r }: { r: BoundaryRow }) => {
  const line = (k: string, v: React.ReactNode) =>
    v == null || v === '' ? null : (
      <div className="d-flex gap-2">
        <span className="text-body-tertiary" style={{ minWidth: '7rem' }}>
          {k}
        </span>
        <span className="text-break">{v}</span>
      </div>
    );
  return (
    <div className="fs-9 d-flex flex-column gap-1">
      <div className="fw-semibold mb-1">
        Epoch {r.epoch} boundary{' '}
        <span
          className="badge ms-1"
          style={{ background: STATUS[r.status].color, color: 'inherit' }}
        >
          {STATUS[r.status].label}
        </span>
      </div>
      {line(
        'Last bank',
        r.last_bank != null ? <SlotNumber slot={r.last_bank} /> : null
      )}
      {line('Last hash', r.last_hash ? <code>{r.last_hash}</code> : null)}
      {line(
        'First bank',
        r.first_bank != null ? <SlotNumber slot={r.first_bank} /> : null
      )}
      {line('First hash', r.first_hash ? <code>{r.first_hash}</code> : null)}
      {line('Checks', checksText(r.checks))}
      {line('Agave', r.version)}
      {line('Ledger', r.ledger_source)}
      {line(
        'Took',
        r.seconds != null ? `${Math.round(r.seconds / 60)} min` : null
      )}
      {line('Runner', r.runner)}
      {line('Stage', r.stage)}
      {line('Progress', progressText(r) ? `slot ${progressText(r)}` : null)}
      {line('Heartbeat', r.heartbeat ? ago(r.heartbeat) : null)}
      {line(
        'Failure',
        r.failure ? <span className="text-danger">{r.failure}</span> : null
      )}
      {line('Run', r.source)}
      {line('Updated', r.updated ? ago(r.updated) : null)}
    </div>
  );
};

/**
 * Epoch boundary replay (staging only): how far vortex-replay has got
 * replaying mainnet's epoch boundaries - epoch E's last bank and E+1's
 * first - and checking them: a cell per epoch colored by status (click
 * for its details), the counts, and the failed and running ones. From
 * vortex-replay's boundary-status.json, rewritten every 15 minutes.
 */
const BoundaryReplay = () => {
  const [data, setData] = useState<BoundaryStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`${API_ENDPOINT}${STATUS_PATH}`)
        .then(r => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
        .then(j => {
          if (!alive) return;
          setData(statusSchema.parse(j));
          setError(null);
        })
        .catch(e => alive && setError(String(e)));
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const rows = useMemo(
    () => [...(data?.epochs ?? [])].sort((a, b) => a.epoch - b.epoch),
    [data]
  );
  const count = (s: Status) =>
    data?.counts[s] ?? rows.filter(r => r.status === s).length;
  const total = rows.length;
  const attention = rows
    .filter(r => r.status === 'failed' || r.status === 'running')
    .sort(
      (a, b) =>
        (a.status === 'failed' ? 0 : 1) - (b.status === 'failed' ? 0 : 1) ||
        a.epoch - b.epoch
    );
  const pickedRow = rows.find(r => r.epoch === picked) ?? null;
  // Not rewritten for a while: the generator has stalled.
  const generatedAt = unixOf(data?.generated);
  const stale =
    generatedAt != null && Date.now() / 1000 - generatedAt > STALE_S;

  const header = (
    <div className="page-header row g-3 align-items-start justify-content-between">
      <div className="col-auto">
        <h1 className="h3">Epoch Boundary Replay</h1>
        <p className="text-body-tertiary lh-sm mb-0 mt-1">
          Mainnet epoch boundaries replayed and checked: each epoch&apos;s last
          bank and the next one&apos;s first
        </p>
      </div>
    </div>
  );

  if (!data)
    return (
      <div className="mb-9">
        {header}
        {error ? (
          <UntrackedState>
            The boundary status isn&apos;t available from this API ({error}).
          </UntrackedState>
        ) : (
          <PageSkeleton rows={SKELETON.boundaryReplay} />
        )}
      </div>
    );

  return (
    <div className="mb-9">
      {header}
      <div className="d-flex flex-column gap-3">
        {stale && (
          <WarningBanner icon="alert-triangle">
            The status hasn&apos;t been rewritten since{' '}
            {new Date(generatedAt! * 1000)
              .toUTCString()
              .replace(' GMT', ' UTC')}{' '}
            ({ago(data.generated)}): it&apos;s written every 15 minutes, so
            vortex-replay&apos;s generator has likely stalled and these counts
            are stale.
          </WarningBanner>
        )}
        <Row className="g-3">
          <Col xs={6} xl={3}>
            <StatCard
              label="Done"
              value={count('done').toLocaleString()}
              sublabel={`${total ? ((count('done') / total) * 100).toFixed(1) : '0'}% of ${total.toLocaleString()} boundaries`}
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              label="Running"
              value={count('running').toLocaleString()}
              sublabel={`${count('queued').toLocaleString()} queued`}
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              label="Failed"
              value={count('failed').toLocaleString()}
              tone={count('failed') ? 'danger' : undefined}
              sublabel={`${count('not-started').toLocaleString()} not started`}
            />
          </Col>
          <Col xs={6} xl={3}>
            <StatCard
              label="Updated"
              mono={false}
              tone={stale ? 'warning' : undefined}
              value={ago(data.generated)}
              sublabel={`through epoch ${data.last_epoch.toLocaleString()} · every 15 min`}
            />
          </Col>
        </Row>

        <SectionCard
          title="Boundaries"
          icon="grid"
          info={`A cell per epoch boundary, ${PER_ROW} to a row, epoch 0 top left: epoch E's last bank and E+1's first, replayed and checked. Click one for its details.`}
        >
          <div className="d-flex flex-wrap column-gap-3 fs-10 text-body-tertiary mb-2">
            {STATUSES.map(s => (
              <span key={s} className="d-inline-flex align-items-center gap-1">
                <span
                  className="d-inline-block rounded-1 border border-translucent"
                  style={{ width: 10, height: 10, background: STATUS[s].color }}
                />
                {STATUS[s].label} {count(s).toLocaleString()}
              </span>
            ))}
          </div>
          <div
            className="d-grid"
            style={{
              // minmax(0, ...): cells shrink to fit a phone (no overflow).
              gridTemplateColumns: `2.5rem repeat(${PER_ROW}, minmax(0, 1fr))`,
              // Spacing and rounding scale with the cells, so desktop's big
              // cells look like a phone's small ones.
              gap: 'clamp(2px, 0.45vw, 7px)'
            }}
          >
            {Array.from({ length: Math.ceil(total / PER_ROW) }, (_, i) => (
              <Row_
                key={i}
                start={i * PER_ROW}
                rows={rows.slice(i * PER_ROW, (i + 1) * PER_ROW)}
                picked={picked}
                onPick={e => setPicked(p => (p === e ? null : e))}
              />
            ))}
          </div>
          {pickedRow && (
            <div className="mt-3 p-3 rounded border border-translucent bg-body-highlight">
              <Details r={pickedRow} />
            </div>
          )}
        </SectionCard>

        {data.hist && <HistCard h={data.hist} />}

        <SectionCard
          title="Failed and Running"
          icon="alert-triangle"
          info="The boundaries that failed (first) and those replaying now, with where and how far."
        >
          {attention.length === 0 ? (
            <p className="fs-9 text-body-tertiary mb-0">
              None failed, none running.
            </p>
          ) : (
            <Table responsive size="sm" className="data-table fs-9 mb-0">
              <thead>
                <tr className="text-nowrap">
                  <th>Epoch</th>
                  <th>Status</th>
                  <th>Runner</th>
                  <th>Stage</th>
                  <th className="text-end">Slot</th>
                  <th>Heartbeat</th>
                  <th>Failure</th>
                </tr>
              </thead>
              <tbody>
                {attention.map(r => (
                  <tr
                    key={r.epoch}
                    role="button"
                    className={r.epoch === picked ? 'table-active' : undefined}
                    onClick={() =>
                      setPicked(p => (p === r.epoch ? null : r.epoch))
                    }
                  >
                    <td className="fw-semibold">{r.epoch}</td>
                    <td>
                      <span
                        className={`badge badge-soft badge-soft-${r.status === 'failed' ? 'danger' : 'info'}`}
                      >
                        {STATUS[r.status].label}
                      </span>
                    </td>
                    <td className="text-nowrap">{r.runner ?? '—'}</td>
                    <td className="text-nowrap">{r.stage ?? '—'}</td>
                    <td className="text-end text-nowrap">
                      {progressText(r) ?? '—'}
                    </td>
                    <td className="text-nowrap">
                      {r.heartbeat ? ago(r.heartbeat) : '—'}
                    </td>
                    <td
                      className="text-danger text-truncate"
                      style={{ maxWidth: '28rem' }}
                      title={r.failure ?? undefined}
                    >
                      {r.failure ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </SectionCard>
      </div>
    </div>
  );
};

/** One grid row: its first epoch, then a cell per epoch. */
const Row_ = ({
  start,
  rows,
  picked,
  onPick
}: {
  start: number;
  rows: BoundaryRow[];
  picked: number | null;
  onPick: (epoch: number) => void;
}) => (
  <>
    <span className="fs-11 text-body-tertiary text-end pe-1 align-self-center">
      {start}
    </span>
    {rows.map(r => (
      <button
        key={r.epoch}
        type="button"
        title={titleOf(r)}
        aria-label={titleOf(r)}
        onClick={() => onPick(r.epoch)}
        className={`p-0 border-0${r.status === 'running' ? ' vx-pulse' : ''}`}
        style={{
          aspectRatio: '1',
          borderRadius: '30%',
          minWidth: 0,
          background: STATUS[r.status].color,
          outline:
            r.epoch === picked
              ? '2px solid var(--vx-body-emphasis-color)'
              : 'none'
        }}
      />
    ))}
  </>
);

export default BoundaryReplay;
