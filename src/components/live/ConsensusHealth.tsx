import SectionCard from 'components/common/SectionCard';
import { recordPath } from 'components/validator/ConsensusRecordHeader';
import { LiveConsensus, LiveSlot } from 'providers/vortex-schemas';
import { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router';

// Finality gap (slots voted on past the finalized slot) that counts as a
// slowdown; normally 1-2.
const GAP_ALERT = 8;
// Keep the details open this long after trouble clears, so it doesn't flap.
const HOLD_MS = 10_000;

const pctPpb = (v: number | null | undefined) =>
  v == null ? '—' : `${(v / 1e7).toFixed(1)}%`;

type Level = 'ok' | 'warn' | 'bad' | 'off';

const DOT: Record<Level, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  bad: 'bg-danger',
  off: 'bg-body-quaternary'
};

/**
 * Consensus health from live consensus (/consensus/live): normally one
 * quiet line (finality gap), since in-flight slots turn over in a few
 * hundred ms. When something's wrong - a standstill, a growing finality
 * gap, votes split between block versions, or no live data while public
 * finality stands still - the line turns amber / red and the slots still
 * in flight open below, with who hasn't voted on the oldest one. Stays
 * open a few seconds after it clears.
 */
const ConsensusHealth = ({
  pool,
  nameOf,
  table,
  mode,
  halted = false
}: {
  pool: LiveConsensus | null;
  nameOf: (node: string | null | undefined) => string;
  /** Renders the in-flight slots table. */
  table: (slots: LiveSlot[], stale: boolean) => ReactNode;
  /** 'line': just the status, inline (for the playback strip; the
   *  source on hover); 'detail': the
   *  in-flight card, only while something's wrong. */
  mode: 'line' | 'detail';
  /** The cluster has halted (useClusterHalt): no slots, so no live view. */
  halted?: boolean;
}) => {
  const gap = pool?.finalityGapSlots ?? null;
  const split = pool?.slots.some(s => s.split) ?? false;
  const stillSecs = pool?.publicFinality?.finalizedStillSecs ?? null;

  let level: Level = 'off';
  let line: ReactNode = 'Live consensus isn’t available from this API.';
  if (halted) {
    level = 'bad';
    line = 'The cluster has halted: no new slots, so nothing is in flight.';
  } else if (pool?.available) {
    if (pool.blind) {
      level = stillSecs != null && stillSecs > 20 ? 'bad' : 'warn';
      line =
        stillSecs != null && stillSecs > 20
          ? `Finality may be stalled: the finalized slot hasn't moved for ${stillSecs}s (public RPC; live data not coming in).`
          : 'Live consensus data isn’t coming in right now.';
    } else if (pool.standstill) {
      level = 'bad';
      line = `Standstill: finality has stopped${gap != null ? ` (${gap} slots voted on past the finalized slot)` : ''}.`;
    } else if (split) {
      level = 'bad';
      line = 'Votes are split between versions of a block in flight.';
    } else if (gap != null && gap >= GAP_ALERT) {
      level = 'warn';
      line = `Finality is slow: ${gap} slots voted on past the finalized slot.`;
    } else {
      level = 'ok';
      line = `Finality normal${gap != null ? ` · ${gap}-slot gap` : ''}.`;
    }
    if (pool.stale && level === 'ok') {
      level = 'warn';
      line = 'Live data paused: the latest snapshot is more than 10 s old.';
    }
  }

  // Open on trouble; hold a little after it clears.
  const trouble = level === 'warn' || level === 'bad';
  const [openUntil, setOpenUntil] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (trouble) setOpenUntil(Date.now() + HOLD_MS);
  }, [trouble, pool]);
  useEffect(() => {
    if (!openUntil) return;
    const id = setTimeout(
      () => tick(t => t + 1),
      Math.max(0, openUntil - Date.now()) + 50
    );
    return () => clearTimeout(id);
  }, [openUntil]);
  const open = trouble || Date.now() < openUntil;

  const source = pool?.nodes.length
    ? pool.nodes
        .map(
          (n, i, all) =>
            // Our own validator(s): 'Vortex node' (numbered if several).
            `${all.length === 1 ? 'Vortex node' : `Vortex node ${i + 1}`} ${n.ok ? (n.voting === false ? 'standby' : 'ok') : 'down'}`
        )
        .join(' · ')
    : null;

  const statusLine = (
    <div className="d-flex flex-wrap align-items-center gap-2 fs-9">
      <span
        className={`d-inline-block rounded-circle ${DOT[level]}`}
        style={{ width: 8, height: 8 }}
      />
      <span
        className={
          level === 'bad'
            ? 'text-danger fw-semibold'
            : level === 'warn'
              ? 'text-warning fw-semibold'
              : 'text-body-tertiary'
        }
      >
        {line}
      </span>
      {source && (
        <span className="text-body-quaternary fs-10 ms-auto">
          Source: {source}
        </span>
      )}
    </div>
  );

  if (mode === 'line')
    return (
      <span
        className="d-inline-flex align-items-center gap-2 min-w-0"
        title={source ? `Source: ${source}` : undefined}
      >
        <span
          className={`d-inline-block rounded-circle flex-shrink-0 ${DOT[level]}`}
          style={{ width: 8, height: 8 }}
        />
        <span
          className={`text-truncate ${
            level === 'bad'
              ? 'text-danger fw-semibold'
              : level === 'warn'
                ? 'text-warning fw-semibold'
                : ''
          }`}
        >
          {line}
        </span>
      </span>
    );
  if (!open || !pool?.available || pool.blind) return null;

  // The oldest slot still in flight, and who hasn't voted on it.
  const oldest = [...pool.slots]
    .filter(s => s.status === 'voting' || s.status === 'notarized')
    .sort((a, b) => a.slot - b.slot)[0];
  return (
    <SectionCard title="Consensus Health" icon="activity">
      <div className="mb-3">{statusLine}</div>
      {table(pool.slots, pool.stale)}
      {oldest?.notVoted && oldest.notVoted.voters > 0 && (
        <p className="fs-9 mt-3 mb-0">
          <span className="text-body-tertiary">
            Not voted yet on{' '}
            <Link to={`/slot/${oldest.slot}`}>
              {oldest.slot.toLocaleString()}
            </Link>{' '}
            ({oldest.notVoted.voters} validators,{' '}
            {pctPpb(oldest.notVoted.stakePpb)} of stake):{' '}
          </span>
          {oldest.notVoted.validators.slice(0, 12).map((v, i) => (
            <span key={v.voteAddress}>
              {i > 0 && ', '}
              <Link
                to={recordPath(v.nodeAddress ?? v.voteAddress, null, 'votes')}
                title="Its voting record (with its live votes)"
              >
                {nameOf(v.nodeAddress)}
              </Link>
            </span>
          ))}
          {oldest.notVoted.validators.length > 12 && '…'}
        </p>
      )}
    </SectionCard>
  );
};

export default ConsensusHealth;
