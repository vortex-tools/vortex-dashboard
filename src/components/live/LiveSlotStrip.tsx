import FeatherIcon from 'feather-icons-react';
import {
  createContext,
  CSSProperties,
  useContext,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Link } from 'react-router';

const WINDOW = 4;
// Dot size and the gap between columns (px): how many columns fit.
// Defaults; a strip can draw bigger cells (`look`).
const DOT = 10;
const COL_GAP = 4;
// The playhead aims to stay this far behind the newest recorded slot (by
// default; data that arrives in bigger batches wants more), and jumps
// forward if it falls further behind than JUMP.
const LEAD = 8;
// Pacing: a step takes the slot time scaled by how far the playhead is
// from its lead (slower as it nears the data, faster when behind), within
// these bounds, so it glides instead of catching the edge and waiting.
const PACE_MIN = 0.6;
const PACE_MAX = 1.6;
const JUMP = 96;
// One column's step (px), and how long the row takes to slide one step.
const STEP = DOT + COL_GAP;
const SLIDE_MS = 320;
// After a hold (pause / hover), the playhead fast-forwards back to the
// present a column per FF_MS.
const FF_MS = 90;
// Room around the newest column for its "now" backing.
const PAD = 3;
const CARD_W = 176; // 11rem

/** How a slot is drawn: a dot class and what it means. */
export type StripCell = { cls: string; label: string };

// A slot not revealed yet, or not recorded yet: an empty socket.
const EMPTY: StripCell = {
  cls: 'border border-translucent',
  label: 'not recorded yet'
};

type Col = {
  start: number;
  /** The window's leader (kept with the column: a held column outlives
   *  the caller's data). */
  leader: string | null;
  cells: Array<{ slot: number; cell: StripCell }>;
};

/** How a strip's cells are drawn: size, gap, and dots or blocks. */
export type StripLook = { size: number; gap: number; shape: 'dot' | 'block' };
const DEFAULT_LOOK: StripLook = { size: DOT, gap: COL_GAP, shape: 'dot' };
const LookContext = createContext<StripLook>(DEFAULT_LOOK);
const roundOf = (shape: StripLook['shape']) =>
  shape === 'block' ? 'rounded-1' : 'rounded-circle';

export const StripDot = ({ cls }: { cls: string }) => {
  const look = useContext(LookContext);
  return (
    <span
      className={`vx-dot d-inline-block ${roundOf(look.shape)} ${cls}`}
      style={{ width: look.size, height: look.size }}
    />
  );
};

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
}) => {
  const look = useContext(LookContext);
  return (
    <div
      data-col={col.start}
      className={`position-relative d-flex flex-column flex-shrink-0 ${className}`}
      style={{ gap: look.gap }}
    >
      {col.cells.map(({ slot, cell }) => (
        <Link
          key={slot}
          to={`/slot/${slot}`}
          className={`d-inline-flex ${roundOf(look.shape)}${slot === hoverSlot ? ' vx-dot-hover' : ''}`}
          aria-label={`Slot ${slot.toLocaleString()}: ${cell.label}`}
          onMouseEnter={() => onHover(slot)}
          onFocus={() => onHover(slot)}
        >
          <StripDot cls={cell.cls} />
        </Link>
      ))}
    </div>
  );
};

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
  cell?: StripCell;
  className?: string;
  style?: CSSProperties;
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
        <StripDot cls={cell.cls} />
        <span className="text-truncate" title={cell.label}>
          {cell.label}
        </span>
      </div>
    )}
  </div>
);

/**
 * Slots, live: a column per 4-slot leader window (its four slots top to
 * bottom), newest at the left. Recorded slots are revealed one per
 * slot-time by a playhead that trails the newest recorded slot (so they
 * appear evenly, not in the ingestor's bursts); when a window fills, the
 * row slides one step right, the next window enters at the left (under
 * the "now" backing) and the oldest fades out under the right edge's
 * mask. As many columns as fit, never one there's no data for. The card
 * names the newest slot and its leader; hovering a dot opens a second
 * card beside it with that slot's leader and record. Pausable, and held
 * while hovered.
 *
 * What a slot shows is the caller's: `cellOf` (null = not recorded yet)
 * and `leaderOf`, read only for slots up to `recorded`.
 */
const LiveSlotStrip = ({
  recorded,
  oldest,
  epochStart,
  slotMs,
  cellOf,
  leaderOf,
  nameOf,
  label,
  legend,
  footnote,
  footnoteTitle,
  waiting = 'waiting for the record…',
  lead = LEAD,
  onHeldChange,
  headerless = false,
  look = DEFAULT_LOOK,
  className
}: {
  /** Cell size, gap and shape (bigger blocks where there's room). */
  look?: StripLook;
  /** Inside a card that already names it: no label row; the pause
   *  control goes to the legend line (and the hold shows via
   *  onHeldChange). */
  headerless?: boolean;
  /** Told when playback is held (paused or hovered), e.g. to highlight
   *  the card the strip sits in. */
  onHeldChange?: (held: boolean) => void;
  /** How far the playhead trails `recorded`: more than the slots a data
   *  refresh brings at once, so it never has to wait for one. */
  lead?: number;
  /** The newest slot with data: the playhead never passes it. */
  recorded: number | null;
  /** The oldest slot with data: columns stop at the first full window
   *  from it. */
  oldest: number | null;
  /** Leader windows start every 4 slots from here (the epoch's first). */
  epochStart: number;
  slotMs: number;
  cellOf: (slot: number) => StripCell | null;
  leaderOf: (slot: number) => string | null | undefined;
  nameOf: (node: string | null) => string | null;
  /** "Live votes": by the live dot (", held" / "Paused" added). */
  label: string;
  legend: Array<[string, string]>;
  footnote?: ReactNode;
  footnoteTitle?: string;
  waiting?: string;
  /** The strip's own box; by default a bordered card whose border turns
   *  primary while held. */
  className?: string;
}) => {
  // This strip's geometry (shadowing the defaults).
  const DOT = look.size;
  const COL_GAP = look.gap;
  const STEP = DOT + COL_GAP;
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
  }, [rowEl, STEP, COL_GAP]);

  // The playhead: one slot per slot-time, never past the record.
  const edgeRef = useRef(recorded);
  edgeRef.current = recorded;
  const [cursor, setCursor] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  // Hovering the strip holds the playhead too (columns stay put under the
  // pointer); it resumes when the pointer leaves.
  const [hovering, setHovering] = useState(false);
  const held = paused || hovering;
  const heldRef = useRef(onHeldChange);
  heldRef.current = onHeldChange;
  useEffect(() => {
    heldRef.current?.(held);
  }, [held]);
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  // Set when a hold ends: fast-forward until back at the present.
  const catchUp = useRef(false);
  useEffect(() => {
    if (cursor == null && recorded != null) setCursor(recorded - lead);
  }, [cursor, recorded, lead]);
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
            ? edge - lead
            : catchUp.current && edge - c > lead
              ? Math.min(c + WINDOW, edge - lead)
              : c + 1;
        if (edge - next <= lead) catchUp.current = false;
        setCursor(next);
      } else catchUp.current = false;
      t = setTimeout(tick, delay());
    };
    // The next step's wait: the slot time, eased by the gap to the data.
    const delay = () => {
      if (catchUp.current) return FF_MS;
      const c = cursorRef.current;
      const edge = edgeRef.current;
      if (c == null || edge == null) return slotMs;
      const gap = edge - c;
      if (gap <= 0) return slotMs;
      return slotMs * Math.min(PACE_MAX, Math.max(PACE_MIN, lead / gap));
    };
    t = setTimeout(tick, delay());
    return () => clearTimeout(t);
  }, [slotMs, held, lead]);

  const liveColumns = useMemo<Col[]>(() => {
    if (cursor == null) return [];
    const align = (x: number) =>
      x - ((((x - epochStart) % WINDOW) + WINDOW) % WINDOW);
    const newest = align(cursor);
    // The oldest window we hold all of: columns stop there, so none is
    // drawn without its data (cut at a window boundary, every column full).
    const first = oldest ?? cursor;
    const firstFull = align(first) === first ? first : align(first) + WINDOW;
    const count = Math.max(
      1,
      Math.min(fit + 1, Math.floor((newest - firstFull) / WINDOW) + 1)
    );
    return Array.from({ length: count }, (_, i) => {
      const start = newest - i * WINDOW;
      return {
        start,
        leader:
          Array.from({ length: WINDOW }, (_, k) => leaderOf(start + k)).find(
            Boolean
          ) ?? null,
        cells: Array.from({ length: WINDOW }, (_, k) => {
          const slot = start + k;
          const rec = slot <= cursor ? cellOf(slot) : null;
          return { slot, cell: rec ?? EMPTY };
        })
      };
    });
  }, [cursor, cellOf, leaderOf, epochStart, oldest, fit]);
  // Held, the row is frozen as it was: the caller's data keeps moving
  // (a feed trims its oldest rows), which would shift the columns.
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

  const shown = columns.flatMap(c => c.cells).filter(c => c.cell !== EMPTY);
  const newest = columns[0];
  const hoverCol =
    hoverSlot != null
      ? columns.find(c => hoverSlot >= c.start && hoverSlot < c.start + WINDOW)
      : undefined;
  const hoverCell = hoverCol?.cells.find(c => c.slot === hoverSlot)?.cell;
  const liveLeader = newest?.leader ?? null;
  const hoverLeader = hoverCol?.leader ?? null;

  return (
    <LookContext.Provider value={look}>
      <div
        className={
          className ??
          `bg-body-emphasis rounded border p-3 mb-3 ${held ? 'border-primary' : 'border-translucent'}`
        }
      >
        <div
          className={`align-items-center gap-2 mb-2 ${headerless ? 'd-none' : 'd-flex'}`}
        >
          <span
            className={`d-inline-block rounded-circle flex-shrink-0 ${held ? 'bg-body-quaternary' : 'bg-success vx-live-dot'}`}
            style={{ width: 8, height: 8 }}
          />
          <span className="fs-9 fw-bold text-body-emphasis">
            {paused ? 'Paused' : hovering ? `${label} · held` : label}
          </span>
          {shown.length === 0 && (
            <span className="fs-10 text-body-tertiary">{waiting}</span>
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
          {legend.map(([cls, text]) => (
            <span key={text} className="d-inline-flex align-items-center gap-1">
              <StripDot cls={cls} />
              {text}
            </span>
          ))}
          {headerless ? (
            <button
              type="button"
              className="btn btn-link btn-sm ms-auto p-0 text-body-tertiary d-inline-flex align-items-center gap-1 fs-10 text-decoration-none"
              onClick={() => setPaused(p => !p)}
              aria-pressed={paused}
              title={footnoteTitle}
            >
              <FeatherIcon icon={paused ? 'play' : 'pause'} size={12} />
              {paused ? 'Resume' : 'Pause'}
            </button>
          ) : (
            footnote && (
              <span
                className="ms-auto text-body-quaternary"
                title={footnoteTitle}
              >
                {footnote}
              </span>
            )
          )}
        </div>
      </div>
    </LookContext.Provider>
  );
};

export default LiveSlotStrip;
