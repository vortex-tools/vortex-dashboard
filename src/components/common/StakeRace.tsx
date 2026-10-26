import FeatherIcon from 'feather-icons-react';
import StakeRaceChart, {
  RACE_FRAME_MS,
  RACE_STEP,
  RaceEntry,
  raceColors
} from 'components/charts/e-charts/StakeRaceChart';
import { useEffect, useMemo, useState } from 'react';
import { Form } from 'react-bootstrap';

export type RaceFrame = {
  epoch: number;
  entries: RaceEntry[];
  /** Share of the stake the entries could be placed in (older epochs
   *  miss some addresses); 1 where it's all of it. */
  located: number;
  /** What `located` counts: addresses placed (default), or clients
   *  recorded. */
  covers?: 'locations' | 'clients';
  /** Placed with a later IP database than the epoch's own. */
  approximate: boolean;
};

/**
 * One breakdown racing for stake, epoch by epoch: play / scrub controls
 * over a StakeRaceChart. Opens on the latest epoch; play runs from the
 * first, `step` epochs a frame, and ends on the latest. The slider
 * moves an epoch at a time; the race keeps its epoch if the frames grow.
 */
const StakeRace = ({
  frames,
  third = true,
  step = RACE_STEP,
  frameMs = RACE_FRAME_MS
}: {
  frames: RaceFrame[];
  /** Epochs a played frame moves on, and how long each takes (ms). */
  step?: number;
  frameMs?: number;
  /** Draw the 1/3 (halt) line where shares come near it. */
  third?: boolean;
}) => {
  const max = useMemo(
    () => Math.max(...frames.map(f => f.entries[0]?.share ?? 0), 0),
    [frames]
  );
  // The longest name any frame shows, for a name column that holds still
  // (about 6.5 px a character at the axis' 12 px, within bounds).
  const labelWidth = useMemo(() => {
    const longest = Math.max(
      ...frames.flatMap(f => f.entries.slice(0, 10).map(e => e.name.length)),
      4
    );
    return Math.min(Math.max(longest * 6.5, 60), 170);
  }, [frames]);
  const colors = useMemo(
    () => raceColors(frames.map(f => f.entries)),
    [frames]
  );
  // The epoch shown (null: the latest), so it holds as frames grow.
  const [atEpoch, setAtEpoch] = useState<number | null>(null);
  const found =
    atEpoch == null ? -1 : frames.findIndex(f => f.epoch === atEpoch);
  const at = found < 0 ? frames.length - 1 : found;
  const setAt = (next: number | ((i: number) => number)) =>
    setAtEpoch(prev => {
      const cur =
        prev == null
          ? frames.length - 1
          : Math.max(
              frames.findIndex(f => f.epoch === prev),
              0
            );
      const i = typeof next === 'function' ? next(cur) : next;
      return frames[Math.min(Math.max(i, 0), frames.length - 1)]?.epoch ?? null;
    });
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(
      () =>
        setAt(i => {
          if (i >= frames.length - 1) {
            setPlaying(false);
            return i;
          }
          return Math.min(i + step, frames.length - 1);
        }),
      frameMs
    );
    return () => clearInterval(t);
  }, [playing, frames.length, step, frameMs]);
  const frame = frames[Math.min(at, frames.length - 1)];
  if (!frame) return null;

  const play = () => {
    if (at >= frames.length - 1) setAt(0);
    setPlaying(p => !p);
  };

  return (
    <div>
      <div className="d-flex align-items-center gap-3 mb-1">
        <button
          type="button"
          className="btn btn-soft-primary btn-sm d-inline-flex align-items-center gap-1"
          onClick={play}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          <FeatherIcon icon={playing ? 'pause' : 'play'} size={14} />
          {playing ? 'Pause' : at >= frames.length - 1 ? 'Replay' : 'Play'}
        </button>
        <Form.Range
          min={0}
          max={frames.length - 1}
          value={at}
          onChange={e => {
            setPlaying(false);
            setAt(Number(e.target.value));
          }}
          aria-label="Epoch"
        />
        <span className="font-monospace fw-bold fs-9 text-nowrap">
          Epoch {frame.epoch}
        </span>
      </div>
      {(frame.located < 0.995 || frame.approximate) && (
        <p
          className="fs-10 text-body-tertiary mb-0"
          title={
            frame.covers === 'clients'
              ? "Older epochs: ValidatorHistory didn't record every validator's client, so part of the stake is unknown; shares are of the whole stake."
              : "Older epochs: ValidatorHistory didn't record every validator's address, so part of the stake can't be placed; shares are of the whole stake. Locations are looked up with today's IP database, so a validator that has since moved may show where it is now."
          }
        >
          {frame.located < 0.995 &&
            `${frame.covers === 'clients' ? 'Client data covers' : 'Locations cover'} ${Math.round(frame.located * 100)}% of this epoch's stake`}
          {frame.located < 0.995 && frame.approximate && ' · '}
          {frame.approximate && 'approximate (placed with a later IP database)'}
        </p>
      )}
      <StakeRaceChart
        entries={frame.entries}
        maxShare={max}
        colors={colors}
        third={third}
        frameMs={frameMs}
        labelWidth={labelWidth}
      />
    </div>
  );
};

export default StakeRace;
