import {
  DataFreshnessSublabel,
  freshness
} from 'components/common/DataFreshness';
import { EpochLive, useEpochLive } from 'hooks/useIngestion';

/** "1d 4h" / "5h 12m" / "12m" / "<1m". */
const formatEta = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  if (m < 1) return '<1m';
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
};

/**
 * The Current Epoch card's subtitle: "62.4% · ~16h 12m left" over a
 * progress strip, data freshness on hover - all from one /epochs/current poll
 * (every minute). Progress shows once the API reports it; the ETA is the
 * API's estimate from recent slot times.
 */
const EpochProgressSublabel = ({
  sources,
  live: given
}: {
  sources: Array<'blocks' | 'footers'>;
  /** The page's own /epochs/current poll, if it has one. */
  live?: EpochLive;
}) => {
  const polled = useEpochLive(!given);
  const { progress, ingestion } = given ?? polled;
  const pct =
    progress && progress.slotsInEpoch > 0
      ? Math.min(100, (progress.slotIndex / progress.slotsInEpoch) * 100)
      : null;
  const left =
    progress?.estimatedEndTime != null
      ? Math.max(0, progress.estimatedEndTime - Date.now() / 1000)
      : null;
  if (pct == null || !progress)
    return <DataFreshnessSublabel sources={sources} ingestion={ingestion} />;
  // One line, like the neighbouring cards: freshness goes in the hover,
  // and the bar is a strip along the card's bottom edge (StatCard is
  // position-relative), taking no height.
  const title = [
    `slot ${progress.slotIndex.toLocaleString()} of ${progress.slotsInEpoch.toLocaleString()}`,
    progress.estimatedEndTime != null
      ? `ends around ${new Date(progress.estimatedEndTime * 1000).toLocaleString()}`
      : null,
    freshness(ingestion, sources)?.title
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <>
      <span title={title}>
        {pct.toFixed(1)}%{left != null && ` · ~${formatEta(left)} left`}
      </span>
      <span
        className="position-absolute bottom-0 start-0 end-0 bg-body-secondary"
        style={{ height: 3 }}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Epoch progress"
      >
        <span
          className="d-block h-100 bg-primary"
          style={{ width: `${pct}%` }}
        />
      </span>
    </>
  );
};

export default EpochProgressSublabel;
