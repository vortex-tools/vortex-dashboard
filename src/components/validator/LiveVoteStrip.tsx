import FeatherIcon from 'feather-icons-react';
import useValidatorLive from 'hooks/useValidatorLive';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { ValidatorLiveSlot } from 'providers/vortex-schemas';
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Link } from 'react-router';

const WINDOW = 4;
// Dot size and the gap between columns (px): how many columns fit.
const DOT = 10;
const COL_GAP = 4;
// The playhead starts this far behind the newest recorded slot, and jumps
// forward if it falls further behind than JUMP (an ingest batch).
const LEAD = 8;
const JUMP = 96;
// One column's step (px), and how long the row takes to slide one step.
const STEP = DOT + COL_GAP;
const SLIDE_MS = 320;
// After a hold (pause / hover), the playhead fast-forwards back to the
// present a column per FF_MS.
const FF_MS = 90;
// Room around the newest column for its "now" backing.
const PAD = 3;

type Cell = { cls: string; label: string };
type Col = {
  start: number;
  /** The window's leader (kept with the column: a held column outlives
   *  the feed's rows). */
  leader: string | null;
  cells: Array<{ slot: number; cell: Cell }>;
};

// The record only (the slot + 8 footer): nothing provisional is drawn.
const FINAL: Record<string, Cell> = {
  notarize: { cls: 'bg-success', label: 'notarize vote landed' },
  // A skip vote on a skipped slot is as valid as a notarize: a green
  // ring around an empty (skipped) slot.
  skip: {
    cls: 'bg-body-emphasis border border-2 border-success',
    label: 'skip vote landed (slot skipped)'
  },
  skippedBlock: {
    cls: 'bg-warning',
    label: 'skipped block: voted skip on a notarized block (paid)'
  },
  missed: { cls: 'bg-danger', label: 'missed: in neither reward certificate' },
  // Nothing to land in (the slot + 8 block was skipped): not the
  // validator's miss, so a light gray-green, not gray or red.
  unpayable: {
    cls: 'bg-vote-unrewardable',
    label: 'unrewardable: no reward certificate (slot + 8 skipped)'
  },
  noData: { cls: 'bg-body-secondary opacity-50', label: 'no data' }
};
const NOT_ELIGIBLE: Cell = {
  cls: 'border border-translucent opacity-50',
  label: 'not eligible'
};
// A slot not revealed yet, or not recorded yet: an empty socket.
const EMPTY: Cell = {
  cls: 'border border-translucent',
  label: 'not recorded yet'
};

const recordOf = (s: ValidatorLiveSlot | undefined): Cell | null => {
  if (!s) return null;
  if (s.state === 'notEligible') return NOT_ELIGIBLE;
  if (s.state === 'final' && s.final && FINAL[s.final]) return FINAL[s.final];
  return null;
};

const LEGEND: Array<[string, string]> = [
  ['bg-success', 'notarize'],
  [FINAL.skip.cls, 'skip'],
  ['bg-warning', 'skipped block'],
  ['bg-danger', 'missed'],
  ['bg-vote-unrewardable', 'unrewardable']
];

const Dot = ({ cls }: { cls: string }) => (
  <span
    className={`vx-dot d-inline-block rounded-circle ${cls}`}
    style={{ width: DOT, height: DOT }}
  />
);

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

const Column = ({
  col,
  className = '',
  hoverSlot,
  onHover
}: {
  col: Col;
  className?: string;
  hoverSlot: number | null;
  onHover: (slot: number | null) => void;
}) => (
  <div
    data-col={col.start}
    className={`position-relative d-flex flex-column flex-shrink-0 ${className}`}
    style={{ gap: COL_GAP }}
  >
    {col.cells.map(({ slot, cell }) => (
      <Link
        key={slot}
        to={`/slot/${slot}`}
        className={`d-inline-flex rounded-circle${slot === hoverSlot ? ' vx-dot-hover' : ''}`}
        aria-label={`Slot ${slot.toLocaleString()}: ${cell.label}`}
        onMouseEnter={() => onHover(slot)}
        onFocus={() => onHover(slot)}
      >
        <Dot cls={cell.cls} />
      </Link>
    ))}
  </div>
);

const CARD_W = 176; // 11rem

/** A slot, its window's leader and (when given) what was recorded. */
const SlotCard = ({
  slot,
  leaderNode,
  leaderName,
  cell,
  className = '',
  style
}: {
  slot: number | null;
  leaderNode: string | null;
  leaderName: string | null;
  cell?: Cell;
  className?: string;
  style?: React.CSSProperties;
}) => (
  <div
    className={`d-flex flex-column justify-content-center gap-1 rounded-2 border px-2 py-1 lh-sm ${className}`}
    style={{ width: CARD_W, ...style }}
  >
    <div className="d-flex align-items-baseline justify-content-between gap-2">
      <span className="fs-10 text-body-tertiary">Slot</span>
      {slot != null && (
        <Link
          to={`/slot/${slot}`}
          className="fs-9 font-monospace fw-bold text-body-emphasis"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {slot.toLocaleString()}
        </Link>
      )}
    </div>
    <div className="d-flex align-items-baseline justify-content-between gap-2 min-w-0">
      <span className="fs-10 text-body-tertiary flex-shrink-0">Leader</span>
      {leaderNode ? (
        <Link
          to={`/validator/${leaderNode}`}
          className="fs-9 fw-semibold text-body text-truncate"
          title={leaderName ?? undefined}
        >
          {leaderName}
        </Link>
      ) : (
        <span className="fs-9 text-body-quaternary">—</span>
      )}
    </div>
    {cell && (
      <div className="d-flex align-items-center gap-1 fs-10 text-body-secondary border-top border-translucent pt-1 min-w-0">
        <Dot cls={cell.cls} />
        <span className="text-truncate" title={cell.label}>
          {cell.label}
        </span>
      </div>
    )}
  </div>
);

/**
 * One validator's votes, live, from the record only
 * (/consensus/validator/live's final rows - the slot + 8 footers): a
 * column per 4-slot leader window, newest at the left. Recorded slots
 * are revealed one per slot-time by a playhead that trails the newest
 * recorded slot (so they appear evenly, not in the ingestor's bursts);
 * when a window fills, the row slides one step right, the next window
 * enters at the left (under the "now" backing) and the oldest fades out
 * under the right edge's mask. As many columns as fit, never one we don't
 * have the data for. The card names the newest slot and its leader;
 * hovering a dot opens a second card beside it with that slot's leader
 * and record. Pausable, and held while hovered. Nothing
 * in flight / provisional is drawn. Current epoch only.
 */
const LiveVoteStrip = ({ voteKey }: { voteKey: string }) => {
  const context = useContext(VortexDataContext);
  const { slots, meta, status } = useValidatorLive(voteKey, true);
  const progress = context?.currentEpochState.progress;
  const slotMs = Math.round((progress?.slotSeconds ?? 0.4) * 1000);
  // Leader windows start every 4 slots from the epoch's first slot.
  const epochStart =
    progress?.absoluteSlot != null && progress.slotIndex != null
      ? progress.absoluteSlot - progress.slotIndex
      : 0;

  // How many columns fit the row (it falls off at the edge). A callback
  // ref: the row mounts only once there's a column to draw.
  const [rowEl, setRowEl] = useState<HTMLDivElement | null>(null);
  const [fit, setFit] = useState(30);
  useLayoutEffect(() => {
    const el = rowEl;
    if (!el) return;
    const measure = () =>
      setFit(Math.max(1, Math.floor((el.clientWidth - PAD + COL_GAP) / STEP)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowEl]);

  // The playhead: one slot per slot-time, never past the record.
  const recorded = meta?.finalThroughSlot ?? null;
  const edgeRef = useRef(recorded);
  edgeRef.current = recorded;
  const [cursor, setCursor] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  // Hovering the strip holds the playhead too (columns stay put under the
  // pointer); it resumes when the pointer leaves.
  const [hovering, setHovering] = useState(false);
  const held = paused || hovering;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  // Set when a hold ends: fast-forward until back at the present.
  const catchUp = useRef(false);
  useEffect(() => {
    if (cursor == null && recorded != null) setCursor(recorded - LEAD);
  }, [cursor, recorded]);
  useEffect(() => {
    if (held) return;
    catchUp.current = true;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const c = cursorRef.current;
      const edge = edgeRef.current;
      if (c != null && edge != null && c < edge) {
        const next =
          edge - c > JUMP
            ? edge - LEAD
            : catchUp.current && edge - c > LEAD
              ? Math.min(c + WINDOW, edge - LEAD)
              : c + 1;
        if (edge - next <= LEAD) catchUp.current = false;
        setCursor(next);
      } else catchUp.current = false;
      t = setTimeout(tick, catchUp.current ? FF_MS : slotMs);
    };
    t = setTimeout(tick, catchUp.current ? FF_MS : slotMs);
    return () => clearTimeout(t);
  }, [slotMs, held]);

  const bySlot = useMemo(() => new Map(slots.map(s => [s.slot, s])), [slots]);
  const liveColumns = useMemo<Col[]>(() => {
    if (cursor == null) return [];
    const align = (x: number) =>
      x - ((((x - epochStart) % WINDOW) + WINDOW) % WINDOW);
    const newest = align(cursor);
    // The oldest window we hold all of: columns stop there, so none is
    // drawn without its data (cut at a window boundary, every column full).
    const oldest = slots.length ? slots[0].slot : cursor;
    const firstFull =
      align(oldest) === oldest ? oldest : align(oldest) + WINDOW;
    const count = Math.max(
      1,
      Math.min(fit + 1, Math.floor((newest - firstFull) / WINDOW) + 1)
    );
    return Array.from({ length: count }, (_, i) => {
      const start = newest - i * WINDOW;
      return {
        start,
        leader:
          Array.from(
            { length: WINDOW },
            (_, k) => bySlot.get(start + k)?.leader
          ).find(Boolean) ?? null,
        cells: Array.from({ length: WINDOW }, (_, k) => {
          const slot = start + k;
          const rec = slot <= cursor ? recordOf(bySlot.get(slot)) : null;
          return { slot, cell: rec ?? EMPTY };
        })
      };
    });
  }, [cursor, bySlot, epochStart, slots, fit]);
  // Held, the row is frozen as it was: the feed keeps trimming its oldest
  // rows, which would otherwise drop the right-most columns.
  const [frozen, setFrozen] = useState<Col[] | null>(null);
  useEffect(() => {
    setFrozen(held ? liveColumns : null);
    // Only on hold / release, not as live columns change.
  }, [held]);
  const columns = (held && frozen) || liveColumns;

  // When the next window enters, the row slides one step right instead
  // of jumping: drawn a step to the left, then eased back into place.
  const trackRef = useRef<HTMLDivElement>(null);
  const prevNewest = useRef<number | null>(null);
  const newestStart = columns[0]?.start ?? null;
  useLayoutEffect(() => {
    const el = trackRef.current;
    const prev = prevNewest.current;
    prevNewest.current = newestStart;
    if (!el || prev == null || newestStart !== prev + WINDOW) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.style.transition = 'none';
    el.style.transform = `translateX(${-STEP}px)`;
    void el.offsetWidth;
    const ms = catchUp.current ? FF_MS : SLIDE_MS;
    el.style.transition = `transform ${ms}ms cubic-bezier(.2,.7,.3,1)`;
    el.style.transform = '';
  }, [newestStart]);

  // Hover: a card beside the hovered dot's column with its slot, leader
  // and record (the left card keeps showing the live slot). Placed from
  // the column's position, re-read as columns shift; flips to the left of
  // the column near the right edge.
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [hoverPos, setHoverPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (hoverSlot == null || !body) return setHoverPos(null);
    const start = columns.find(
      c => hoverSlot >= c.start && hoverSlot < c.start + WINDOW
    )?.start;
    const el =
      start != null
        ? body.querySelector<HTMLElement>(`[data-col="${start}"]`)
        : null;
    if (!el) return setHoverPos(null);
    // Offsets, not client rects: they ignore the row's slide transform.
    let x = 0;
    for (let e: HTMLElement | null = el; e && e !== body; ) {
      x += e.offsetLeft;
      e = e.offsetParent as HTMLElement | null;
    }
    const right = x + DOT + 10;
    setHoverPos({
      left: right + CARD_W <= body.clientWidth ? right : x - 10 - CARD_W,
      top: 0
    });
  }, [hoverSlot, columns]);

  if (status !== 'ok' && status !== 'loading') return null;
  const shown = columns.flatMap(c => c.cells).filter(c => c.cell !== EMPTY);
  const newest = columns[0];
  const nameOf = (node: string | null) =>
    node
      ? (context?.validatorDirectoryState.byNodeAddress?.get(node)?.name ??
        short(node))
      : null;
  const hoverCol =
    hoverSlot != null
      ? columns.find(c => hoverSlot >= c.start && hoverSlot < c.start + WINDOW)
      : undefined;
  const hoverCell = hoverCol?.cells.find(c => c.slot === hoverSlot)?.cell;
  const liveLeader = newest?.leader ?? null;
  const hoverLeader = hoverCol?.leader ?? null;

  return (
    <div className="bg-body-emphasis rounded border border-translucent p-3 mb-3">
      <div className="d-flex align-items-center gap-2 mb-2">
        <span
          className={`d-inline-block rounded-circle flex-shrink-0 ${held ? 'bg-body-quaternary' : 'bg-success vx-live-dot'}`}
          style={{ width: 8, height: 8 }}
        />
        <span className="fs-9 fw-bold text-body-emphasis">
          {paused ? 'Paused' : hovering ? 'Live votes · held' : 'Live votes'}
        </span>
        {shown.length === 0 && (
          <span className="fs-10 text-body-tertiary">
            waiting for the record…
          </span>
        )}
        <button
          type="button"
          className="btn btn-link btn-sm ms-auto p-0 text-body-tertiary d-inline-flex align-items-center gap-1 fs-10 text-decoration-none"
          onClick={() => setPaused(p => !p)}
          aria-pressed={paused}
          title={paused ? 'Resume' : 'Pause'}
        >
          <FeatherIcon icon={paused ? 'play' : 'pause'} size={14} />
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>
      {!newest ? (
        <div
          className="d-flex align-items-center fs-10 text-body-tertiary"
          style={{ height: WINDOW * STEP - COL_GAP + 2 * PAD }}
        >
          Connecting…
        </div>
      ) : (
        <div
          ref={bodyRef}
          className="d-flex align-items-stretch gap-3 position-relative"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => {
            setHoverSlot(null);
            setHovering(false);
          }}
        >
          {/* The live slot and its leader. */}
          <SlotCard
            slot={cursor ?? newest.start}
            leaderNode={liveLeader}
            leaderName={nameOf(liveLeader)}
            className="flex-shrink-0 bg-body-highlight border-translucent"
          />
          {/* Every window, newest first under the "now" backing; the row
              slides right as windows enter and fades out at the edge. */}
          <div
            ref={setRowEl}
            className="vx-live-row position-relative overflow-hidden flex-grow-1 d-flex align-items-center"
            style={{ minWidth: 0, padding: PAD }}
          >
            <span
              className="position-absolute rounded-pill bg-primary-subtle"
              style={{ left: 0, top: 0, bottom: 0, width: DOT + 2 * PAD }}
            />
            <div
              ref={trackRef}
              className="d-flex position-relative"
              style={{ gap: COL_GAP }}
            >
              {columns.slice(0, fit + 1).map((col, i) => (
                <Column
                  key={col.start}
                  col={col}
                  className={i === 0 ? 'vx-col-in' : ''}
                  hoverSlot={hoverSlot}
                  onHover={setHoverSlot}
                />
              ))}
            </div>
          </div>
          {/* The hovered dot's card, beside its column. */}
          {hoverSlot != null && hoverPos && (
            <SlotCard
              key="hover"
              slot={hoverSlot}
              leaderNode={hoverLeader}
              leaderName={nameOf(hoverLeader)}
              cell={hoverCell}
              className="vx-hover-card position-absolute bg-body-emphasis border-primary-subtle shadow"
              style={{ left: hoverPos.left, top: 0, bottom: 0, zIndex: 2 }}
            />
          )}
        </div>
      )}
      <div className="d-flex flex-wrap align-items-center column-gap-3 row-gap-1 fs-10 text-body-tertiary mt-2">
        {LEGEND.map(([cls, label]) => (
          <span key={label} className="d-inline-flex align-items-center gap-1">
            <Dot cls={cls} />
            {label}
          </span>
        ))}
        <span
          className="ms-auto text-body-quaternary"
          title="Only what the chain recorded: each slot's votes from the reward certificates in the block 8 slots later, replayed one per slot-time a little behind the chain."
        >
          The record, replayed at block pace
        </span>
      </div>
    </div>
  );
};

export default LiveVoteStrip;
