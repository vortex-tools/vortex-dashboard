import FeatherIcon from 'feather-icons-react';
import Button from 'components/base/Button';
import { ReactNode } from 'react';
import { ProgressBar } from 'react-bootstrap';

// Data trailing the chain by more than this is shown as delayed.
const DELAYED_SECS = 120;

/** "45s" / "12m" / "3.1h". */
const ago = (secs: number) =>
  secs < 90
    ? `${Math.round(secs)}s`
    : secs < 5400
      ? `${Math.round(secs / 60)}m`
      : `${(secs / 3600).toFixed(1)}h`;

/**
 * The live page's transport, in the leaderboards' epoch strip style:
 * where playback is (live / paused, the running slot) beside the
 * controls - play / pause, and while paused step back / forward (Play
 * resumes from the live edge) - with the pace; the finality status on its
 * own line; the epoch and how far through it over a thin bar. Keyboard:
 * space, arrows (handled by the page).
 */
const PlaybackBar = ({
  slot,
  epoch,
  epochPct,
  playing,
  held = false,
  behindSecs,
  stuck,
  stuckSecs,
  stepMs,
  finality,
  onToggle,
  onStep
}: {
  slot: number | null;
  epoch: number | null;
  /** 0-100, where the epoch is. */
  epochPct: number | null;
  playing: boolean;
  /** Playing, but held while the pointer is over the leader sections. */
  held?: boolean;
  /** How far the data trails the chain (s); flagged past DELAYED_SECS. */
  behindSecs?: number | null;
  /** Something's stuck (the page explains it below the bar). */
  stuck?: 'offline' | 'chain' | 'data' | null;
  stuckSecs?: number | null;
  stepMs: number;
  /** The finality status line. */
  finality: ReactNode;
  onToggle: () => void;
  onStep: (delta: number) => void;
}) => {
  const delayed = behindSecs != null && behindSecs > DELAYED_SECS;
  const badge = stuck
    ? {
        cls: stuck === 'data' ? 'badge-soft-warning' : 'badge-soft-danger',
        text:
          stuck === 'offline'
            ? 'Offline'
            : stuck === 'chain'
              ? `Halted ${ago(stuckSecs ?? 0)}`
              : `Stalled ${ago(stuckSecs ?? 0)}`
      }
    : !playing
      ? { cls: 'badge-soft-secondary', text: 'Paused' }
      : held
        ? { cls: 'badge-soft-secondary', text: 'Held' }
        : delayed
          ? {
              cls: 'badge-soft-warning',
              text: `Delayed ${ago(behindSecs!)}`
            }
          : { cls: 'badge-soft-success', text: 'Live' };
  const stepBtn = (delta: number, icon: string, label: string) => (
    <Button
      variant="soft-secondary"
      className="rounded-circle d-flex align-items-center justify-content-center p-0 flex-shrink-0"
      style={{ width: 26, height: 26 }}
      onClick={() => onStep(delta)}
      aria-label={label}
      title={`${label} (${delta < 0 ? '←' : '→'})`}
    >
      <FeatherIcon icon={icon} size={12} />
    </Button>
  );
  return (
    <div className="playback-strip mx-n3 px-3 border-top border-translucent py-2">
      {/* One fact a line: where playback is (with the controls at the
          right), the finality status, then the epoch over its bar. */}
      <div className="d-flex justify-content-between align-items-center fs-9 text-body-tertiary column-gap-3">
        <div className="d-flex align-items-center column-gap-2 min-w-0">
          <span
            className={`badge badge-soft fs-10 ${badge.cls}`}
            title={
              !stuck && delayed
                ? `The data is ${ago(behindSecs!)} behind the chain (catching up)`
                : undefined
            }
          >
            {badge.text}
          </span>
          <span className="text-nowrap">
            Slot{' '}
            <span
              className="font-monospace fw-bold text-body-emphasis d-inline-block"
              style={{ minWidth: '11ch' }}
            >
              {slot != null ? slot.toLocaleString() : '—'}
            </span>
          </span>
        </div>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <span className="d-none d-sm-inline">
            {!playing
              ? 'Paused'
              : held
                ? 'Held while hovering'
                : `One slot per ${stepMs} ms`}
          </span>
          {/* Stepping is for a paused view (the arrow keys work either
              way). */}
          {!playing && stepBtn(-1, 'skip-back', 'Previous slot')}
          <Button
            variant="primary"
            className="rounded-circle d-flex align-items-center justify-content-center p-0 flex-shrink-0"
            style={{ width: 30, height: 30 }}
            onClick={onToggle}
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'Pause (space)' : 'Play from live (space)'}
          >
            <FeatherIcon icon={playing ? 'pause' : 'play'} size={14} />
          </Button>
          {!playing && stepBtn(1, 'skip-forward', 'Next slot')}
        </div>
      </div>
      <div className="d-flex align-items-center min-w-0 fs-9 text-body-tertiary mt-1">
        {finality}
      </div>
      {epoch != null && (
        <div className="fs-10 text-body-tertiary mt-2 mb-1">
          Epoch {epoch}
          {epochPct != null && ` · ${epochPct.toFixed(1)}%`}
        </div>
      )}
      <ProgressBar
        now={epochPct ?? 0}
        variant="primary"
        className={epoch == null ? 'mt-2' : undefined}
        style={{
          height: '6px',
          border: '1px solid var(--vx-border-color)'
        }}
      />
    </div>
  );
};

export default PlaybackBar;
