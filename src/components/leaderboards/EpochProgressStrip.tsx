import { faPause, faPlay } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Button from 'components/base/Button';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { ProgressBar, Spinner } from 'react-bootstrap';

const REFRESH_S = 60;

/**
 * The current epoch's progress above a consensus leaderboard, as on the
 * Tower voting leaderboard: slots ingested of the epoch, a countdown to
 * the next refresh (which this strip drives - pause to hold the table
 * still), and a thin bar.
 */
const EpochProgressStrip = ({
  ingested,
  total,
  loading,
  onRefresh,
  freshness
}: {
  /** Slots of the epoch ingested so far (null: not known yet). */
  ingested: number | null;
  total: number;
  loading: boolean;
  onRefresh: () => void;
  /** How current the source data is (e.g. "data current"), after the
   *  progress. */
  freshness?: ReactNode;
}) => {
  const [auto, setAuto] = useState(true);
  const [left, setLeft] = useState(REFRESH_S);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  useEffect(() => {
    if (!auto) return;
    setLeft(REFRESH_S);
    const id = setInterval(
      () =>
        setLeft(s => {
          if (s <= 1) {
            refreshRef.current();
            return REFRESH_S;
          }
          return s - 1;
        }),
      1000
    );
    return () => clearInterval(id);
  }, [auto]);

  const pct = ingested != null ? Math.min(100, (ingested / total) * 100) : null;
  return (
    <div className="mx-n3 px-3 border-top border-translucent py-2">
      <div className="d-flex justify-content-between align-items-center fs-9 text-body-tertiary mb-1 gap-3">
        <span>
          Epoch in progress ·{' '}
          {pct == null ? (
            'Loading…'
          ) : (
            <>
              <span className="d-none d-md-inline">
                {ingested!.toLocaleString()}/{total.toLocaleString()} slots (
              </span>
              {pct.toFixed(1)}%<span className="d-none d-md-inline">)</span>
            </>
          )}
          {freshness && <> · {freshness}</>}
        </span>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <span className="d-flex align-items-center gap-2">
            {loading ? (
              <>
                <Spinner
                  animation="border"
                  size="sm"
                  style={{ width: 12, height: 12, borderWidth: 2 }}
                />
                Refreshing…
              </>
            ) : auto ? (
              <>Refreshes in {left}s</>
            ) : (
              <>Auto-refresh paused</>
            )}
          </span>
          <Button
            variant="soft-secondary"
            className="rounded-circle d-flex align-items-center justify-content-center p-0 flex-shrink-0"
            style={{ width: 22, height: 22 }}
            onClick={() => setAuto(a => !a)}
            aria-label={auto ? 'Pause auto-refresh' : 'Resume auto-refresh'}
          >
            <FontAwesomeIcon
              icon={auto ? faPause : faPlay}
              style={{ fontSize: 10 }}
            />
          </Button>
        </div>
      </div>
      <ProgressBar
        now={pct ?? 100}
        animated={pct == null}
        striped={pct == null}
        variant="primary"
        style={{
          height: '6px',
          border: '1px solid var(--vx-border-color)'
        }}
      />
    </div>
  );
};

/** Slots of the current epoch ingested, from a board's lastIngestedSlot
 *  and the epoch's first slot (/epochs/current progress). */
export const ingestedOfEpoch = (
  lastIngestedSlot: number | null | undefined,
  progress:
    | { absoluteSlot: number | null; slotIndex: number | null }
    | null
    | undefined
) =>
  lastIngestedSlot != null &&
  progress?.absoluteSlot != null &&
  progress.slotIndex != null
    ? Math.max(
        0,
        lastIngestedSlot - (progress.absoluteSlot - progress.slotIndex) + 1
      )
    : null;

export default EpochProgressStrip;
