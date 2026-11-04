import SectionCard from 'components/common/SectionCard';
import Pager from 'components/common/Pager';
import DelayedSpinner from 'components/common/DelayedSpinner';
import UntrackedState from 'components/common/UntrackedState';
import {
  PRODUCTION_WINDOWS_PAGE,
  VortexDataContext,
  WindowsFilter,
  productionWindowsKey
} from 'providers/VortexDataProvider';
import { ProductionWindows } from 'providers/vortex-schemas';
import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode
} from 'react';
import { Form, Table } from 'react-bootstrap';
import { Link } from 'react-router';
import useLiveWindows, { when } from 'hooks/useLiveWindows';
import { placeOf, useValidatorGeoAt } from 'hooks/useValidatorGeo';
import useWindowHandoffs, { WindowHandoffs } from 'hooks/useWindowHandoffs';

const PAGE = PRODUCTION_WINDOWS_PAGE;
// Slot outcomes that are known (else the slot is still ahead).
const DECIDED = ['block', 'skipped', 'noData'];
// A block that carried less than this share of the online stake is thin
// (the API's thin flag when it sends one; 1 - classification.thinShare).
const THIN = 0.98;
// Carried >= 99.9% of the online stake: full for the score.
const PERFECT = 0.999;
const isPerfect = (s: Slot) =>
  s.outcome === 'block' && (s.perfect ?? (slotInclusion(s) ?? 0) >= PERFECT);
const isThin = (s: Slot) =>
  s.outcome === 'block' && (s.thin ?? (slotInclusion(s) ?? 1) < THIN);

type Window = ProductionWindows['windows'][number];
export type Slot = Window['slots'][number];

const share = (ppb: number | null) => (ppb == null ? null : ppb / 1e9);
const pct = (v: number | null) =>
  v == null ? '—' : `${(v * 100).toFixed(1)}%`;

/** A slot's inclusion: the share of the stake online for slot - 8
 *  (offline voters left out) its block carried - else, on older APIs, of
 *  all stake. null: no block, or not ingested. */
const slotInclusion = (s: Slot) =>
  s.idealStakePpb != null && s.includedIdealStakePpb != null
    ? s.idealStakePpb > 0
      ? s.includedIdealStakePpb / s.idealStakePpb
      : null
    : share(s.includedStakePpb);

/** The window's inclusion over its payable slots (block or skipped, a
 *  skip carrying 0): online stake carried / online stake, as the board's
 *  inclusion (else the mean included share of all stake). */
const windowInclusion = (w: Window) => {
  const payable = w.slots.filter(
    s =>
      s.outcome === 'skipped' ||
      (s.outcome === 'block' && s.includedStakePpb != null)
  );
  if (!payable.length) return null;
  if (payable.every(s => s.idealStakePpb != null)) {
    const ideal = payable.reduce((a, s) => a + (s.idealStakePpb ?? 0), 0);
    // As the score: a block that carried 99.9%+ counts as full.
    const got = payable.reduce(
      (a, s) =>
        a +
        (isPerfect(s)
          ? (s.idealStakePpb ?? 0)
          : (s.includedIdealStakePpb ?? 0)),
      0
    );
    return ideal > 0 ? got / ideal : null;
  }
  return (
    payable.reduce((a, s) => a + (share(s.includedStakePpb) ?? 0), 0) /
    payable.length
  );
};

export const SlotCell = ({ s }: { s: Slot }) => {
  const v = slotInclusion(s);
  const cls =
    s.outcome === 'skipped'
      ? 'bg-danger-subtle text-danger'
      : s.outcome === 'block'
        ? isThin(s)
          ? 'bg-warning-subtle text-warning'
          : 'bg-success-subtle text-success'
        : 'bg-body-secondary text-body-tertiary';
  const label =
    s.outcome === 'skipped'
      ? 'skip'
      : s.outcome === 'block'
        ? v == null
          ? 'block'
          : isPerfect(s)
            ? pct(v)
            : // Rounded down, so a block short of full never reads 99.9%.
              `${(Math.floor(v * 1000) / 10).toFixed(1)}%`
        : s.outcome === 'noData'
          ? 'no data'
          : '…';
  return (
    <Link
      to={`/slot/${s.slot}`}
      className={`d-inline-block rounded-1 text-center font-monospace fs-10 px-1 ${cls}`}
      style={{ minWidth: '3.1rem', height: '1.25rem', lineHeight: '1.25rem' }}
      title={`Slot ${s.slot.toLocaleString()}: ${s.outcome}${
        v != null
          ? ` · carried ${pct(v)} of the online stake for slot ${(s.slot - 8).toLocaleString()}${
              s.idealStakePpb != null
                ? ` (online ${pct(share(s.idealStakePpb))} of all; carried ${pct(share(s.includedStakePpb))} of all)`
                : ''
            } · notarize ${pct(share(s.notarStakePpb))}, skip ${pct(share(s.skipStakePpb))}`
          : ''
      }`}
    >
      {label}
    </Link>
  );
};

/** How slow a time is against its reference (the cluster's median):
 *  up to 10% over green, up to 25% amber, beyond red. */
const paceTone = (ms: number, ref: number | null | undefined) =>
  !ref
    ? 'bg-body-secondary text-body'
    : ms <= ref * 1.1
      ? // Fine: faded, so the slow ones stand out.
        'vx-chip-agreed'
      : ms <= ref * 1.25
        ? 'bg-warning-subtle text-warning'
        : 'bg-danger-subtle text-danger';

export type Pace = {
  /** The cluster's median slot within a window. */
  slotMs: number | null;
  /** The cluster's median handoff (a window's first slot). */
  handoffMs: number | null;
};

/** A window as a timeline: its 4 blocks and the next leader's first in a
 *  row, each arrow between two blocks labeled with the time between them
 *  (colored against the cluster's medians) - the first arrow the handoff
 *  to it (from the previous leader's last block), the last the handoff on
 *  to the next leader. */
const WindowTimeline = ({
  first,
  h,
  pace,
  who
}: {
  first: number;
  h: WindowHandoffs | null;
  pace: Pace | undefined;
  /** "Kiln (Frankfurt am Main, DE)": a leader, for the handoffs' hovers. */
  who: (node: string | null) => string | null;
}) => {
  const prev = who(h?.prevLeader ?? null);
  const next = who(h?.nextLeader ?? null);
  const gap = (
    key: string,
    ms: number | null | undefined,
    ref: number | null | undefined,
    title: string,
    state: 'timed' | 'skip' | 'clamped' | 'pending' | 'same',
    skipped = false
  ) => (
    <span
      key={key}
      className={`d-inline-flex align-items-center rounded-1 px-1 font-monospace fs-10 ${
        state === 'timed' && ms != null
          ? paceTone(ms, ref)
          : 'text-body-tertiary'
      }`}
      style={{
        minWidth: '4.1rem',
        justifyContent: 'center',
        height: '1.25rem'
      }}
      title={title}
    >
      →{' '}
      {state === 'timed' && ms != null
        ? `${Math.round(ms)}ms${skipped ? '*' : ''}`
        : state === 'clamped'
          ? '??ms'
          : state === 'same'
            ? ''
            : state === 'skip'
              ? ''
              : '…'}
    </span>
  );
  const block = (
    slot: number,
    kind: 'block' | 'skip' | 'pending',
    next = false
  ) => (
    <Link
      key={`b${slot}`}
      to={`/slot/${slot}`}
      className={`d-inline-block rounded-1 flex-shrink-0 ${
        kind === 'block'
          ? 'bg-success'
          : kind === 'skip'
            ? 'bg-danger'
            : 'bg-body-secondary'
      }`}
      style={{ width: 12, height: 12, opacity: next ? 0.35 : 0.85 }}
      title={`Slot ${slot.toLocaleString()}${next ? " - the next leader's first" : ''}: ${kind === 'pending' ? 'not in yet' : kind === 'skip' ? 'skipped' : 'block'}`}
    />
  );
  const parts = [];
  for (let k = 0; k < 4; k++) {
    const t = h?.slots[k];
    const handoff = k === 0 && !h?.sameIn;
    parts.push(
      gap(
        `g${k}`,
        t?.ms,
        handoff ? pace?.handoffMs : pace?.slotMs,
        t?.state === 'timed' && t.ms != null
          ? `${Math.round(t.ms)} ms ${handoff ? `from the previous leader${prev ? `, ${prev}` : ''}: its last block to this one's first (the handoff)` : 'from its block before'}${t.skipped ? ', across a skipped slot' : ''}`
          : t?.state === 'clamped'
            ? "A block time here is clamped (its producer's clock is off): not timed"
            : t?.state === 'skip'
              ? 'Skipped: no block to time'
              : 'Not in yet',
        t?.state ?? 'pending',
        t?.skipped
      ),
      block(
        first + k,
        t?.state === 'skip'
          ? 'skip'
          : t?.state === 'pending' || !t
            ? 'pending'
            : 'block'
      )
    );
  }
  const out = h?.out ?? null;
  // It leads the next window too: no handoff, nothing after its blocks.
  if (!h?.sameOut)
    parts.push(
      gap(
        'out',
        out?.ms,
        pace?.handoffMs,
        out
          ? `${Math.round(out.ms)} ms to the next leader${next ? `, ${next}` : ''}: its last block to their first (the handoff on)${out.skipped ? ', across a skipped slot' : ''}`
          : h?.sameOut
            ? 'It leads the next window too: no handoff'
            : 'Not in yet',
        out ? 'timed' : h?.sameOut ? 'same' : 'pending',
        out?.skipped
      ),
      block(first + 4, out ? 'block' : 'pending', true)
    );
  return (
    <td>
      <div className="d-flex align-items-center gap-1 text-nowrap">{parts}</div>
    </td>
  );
};

/**
 * One validator's leader windows in an epoch (/epochs/production/windows),
 * newest first: each slot's outcome and the share of the online stake
 * its block's reward certificates carried (the votes on slot - 8), and
 * the window's inclusion (skips carrying 0 - over the epoch it's the
 * board's inclusion). Filter to windows with a skip or a thin block.
 */
const ProducerWindowsTable = ({
  voteKey,
  epoch,
  nodeAddress,
  current = false,
  card,
  mode = 'inclusion',
  pace
}: {
  voteKey: string;
  epoch: number;
  /** Its identity: the leader schedule's key, for the live rows. */
  nodeAddress?: string | null;
  /** The current epoch: the window being produced and the next ones on
   *  top, live, and a When column. */
  current?: boolean;
  /** Draw its card: the filter goes in the card's header. */
  card?: { title: string; icon: string; info?: string };
  /** inclusion (the Production tab): each slot's outcome and the stake
   *  its block carried. timing (the Network tab): each slot's time from
   *  the block before, the first slot's the handoff to it, and the
   *  handoff on to the next leader - colored against the cluster's. */
  mode?: 'inclusion' | 'timing';
  /** timing: the cluster's medians to color against. */
  pace?: Pace;
}) => {
  const timing = mode === 'timing';
  const context = useContext(VortexDataContext);
  const slice = context?.productionWindowsState;
  const fetchData = slice?.fetchData;
  const [filter, setFilter] = useState<WindowsFilter>('all');
  const [page, setPage] = useState(0);
  // Paged API: one page of played windows per request, newest first; the
  // beforeSlot of each page so far (Older pushes, Newer pops).
  const [befores, setBefores] = useState<Array<number | null>>([null]);
  useEffect(() => {
    setBefores([null]);
    setPage(0);
    setFilter('all');
  }, [voteKey, epoch]);
  // The first page decides the mode: an API without paging returns the
  // whole epoch (no nextBeforeSlot) - then page that one response here
  // rather than refetch it per page.
  const firstKey = productionWindowsKey(voteKey, epoch);
  const first = slice?.data.get(firstKey);
  const legacy = first != null && first.nextBeforeSlot === undefined;
  const key = legacy
    ? firstKey
    : productionWindowsKey(voteKey, epoch, {
        beforeSlot: befores[befores.length - 1],
        filter
      });
  // Live rows (current epoch): played since its newest ingested window,
  // being produced, next. Keyed off the first page's newest.
  const liveWin = useLiveWindows(
    nodeAddress,
    epoch,
    current,
    first && first.nextBeforeSlot !== undefined
      ? (first.windows[0]?.firstSlot ?? null)
      : null
  );
  const fresh = slice?.data.get(key);
  useEffect(() => {
    fetchData?.(key);
  }, [key, fetchData]);
  // A page showing a window still being ingested (its slots fill in a
  // few seconds after they're produced) re-reads itself until it's done -
  // the cache is otherwise forever.
  // (Only near the ingest tip: the cutover epoch's first 8 slots never
  // get an inclusion.)
  const tip = fresh?.lastIngestedSlot ?? null;
  const undecided = !!fresh?.windows.some(
    w =>
      (tip == null || w.firstSlot + 64 > tip) &&
      w.slots.some(
        s =>
          (!DECIDED.includes(s.outcome) || s.includedStakePpb == null) &&
          s.outcome !== 'skipped' &&
          s.outcome !== 'noData'
      )
  );
  useEffect(() => {
    if (!undecided || legacy) return;
    const id = setInterval(() => fetchData?.(key, { force: true }), 15_000);
    return () => clearInterval(id);
  }, [undecided, legacy, key, fetchData]);
  // Switching filter or paging shouldn't wait on the server: once the
  // first page is in, fetch each filter's first page and the next page
  // of the one showing in the background (the slice dedupes and caches).
  const paged = first != null && first.nextBeforeSlot !== undefined;
  const nextBefore = fresh?.nextBeforeSlot ?? null;
  const perKind = first?.poorWindows !== undefined;
  useEffect(() => {
    if (!paged) return;
    const filters: WindowsFilter[] = perKind
      ? ['issues', 'poor', 'skipped']
      : ['issues'];
    for (const f of filters)
      fetchData?.(productionWindowsKey(voteKey, epoch, { filter: f }));
  }, [paged, perKind, voteKey, epoch, fetchData]);
  useEffect(() => {
    if (!paged || nextBefore == null) return;
    fetchData?.(
      productionWindowsKey(voteKey, epoch, { filter, beforeSlot: nextBefore })
    );
  }, [paged, nextBefore, voteKey, epoch, filter, fetchData]);
  // While the next page loads, keep the last one on screen.
  const lastRef = useRef(fresh);
  if (fresh) lastRef.current = fresh;
  const data = fresh ?? (first ? lastRef.current : undefined);
  const loadingPage = !fresh && !!data;
  const failed = !data && !slice?.isLoading && !!slice?.error;
  // Windows with any slot decided, newest first; the ones still ahead are
  // only counted (listing them first buried the recent windows).
  const { played, upcoming } = useMemo(() => {
    if (!legacy) return { played: data?.windows ?? [], upcoming: [] };
    const ws = [...(data?.windows ?? [])].sort(
      (a, b) => b.firstSlot - a.firstSlot
    );
    const decided = (w: Window) =>
      w.slots.some(s => DECIDED.includes(s.outcome));
    return {
      played: ws.filter(decided),
      upcoming: ws.filter(w => !decided(w)).reverse()
    };
  }, [data, legacy]);
  const windows = useMemo(
    () =>
      filter === 'all' || !legacy
        ? played
        : played.filter(w =>
            w.slots.some(
              s =>
                (filter !== 'poor' && s.outcome === 'skipped') ||
                (filter !== 'skipped' && isThin(s))
            )
          ),
    [played, filter, legacy]
  );
  // timing: the page's slot times and handoffs, from the slots' block
  // times (the live windows' from their poller, as they fill in).
  const pageWindows = legacy
    ? windows.slice(page * PAGE, (page + 1) * PAGE)
    : windows;
  // The live rows' too: their neighbours' blocks (the handoffs) aren't
  // in the poller's slots. Re-read as a row's window plays.
  // timing: who the leaders either side were, and where (that epoch).
  const geoSet = useValidatorGeoAt(epoch, timing);
  const who = (node: string | null) => {
    if (!node) return null;
    const g = geoSet?.byNode.get(node);
    const name = g?.name ?? `${node.slice(0, 4)}…${node.slice(-4)}`;
    const place = placeOf(g);
    return place ? `${name} (${place})` : name;
  };
  const handoffsOf = useWindowHandoffs(
    timing
      ? [
          ...[...liveWin.live]
            .filter(l => l.state !== 'ahead')
            .map(l => l.firstSlot),
          ...pageWindows.map(w => w.firstSlot)
        ]
      : [],
    timing ? liveWin.infos : undefined,
    timing ? (liveWin.slotNow ?? 0) : 0
  );

  if (failed)
    return (
      <UntrackedState className="mb-0">
        Leader slots aren&apos;t available right now.
      </UntrackedState>
    );
  if (!data) return <DelayedSpinner loading label="Loading leader slots…" />;
  if (legacy && !data.windows.length)
    return (
      <p className="fs-9 text-body-tertiary mb-0">
        No leader slots this epoch.
      </p>
    );
  // Paged: the server's counts; legacy: the whole list's.
  const playedN = legacy ? played.length : (data.playedWindows ?? 0);
  // Live (current epoch): ahead / next from the schedule and the clock -
  // the data's own figures trail ingestion.
  const liveNext =
    liveWin.live.find(l => l.state === 'ahead')?.firstSlot ?? null;
  const upcomingN =
    current && liveWin.total > 0
      ? liveWin.ahead
      : legacy
        ? upcoming.length
        : (data.upcomingWindows ?? 0);
  const nextSlot =
    current && liveNext != null
      ? liveNext
      : legacy
        ? (upcoming[0]?.firstSlot ?? null)
        : (data.nextWindowSlot ?? null);
  const total = legacy
    ? windows.length
    : filter === 'issues'
      ? (data.issueWindows ?? 0)
      : filter === 'skipped'
        ? (data.skippedWindows ?? 0)
        : filter === 'poor'
          ? (data.poorWindows ?? 0)
          : playedN;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const pageIndex = legacy ? page : befores.length - 1;
  const shown = legacy
    ? windows.slice(page * PAGE, (page + 1) * PAGE)
    : windows;
  // The live rows go above the first page of all windows, newest first;
  // a window the produced-blocks data already has is left to it.
  const newestPlayed = shown[0]?.firstSlot ?? -1;
  const liveRows =
    current && pageIndex === 0 && filter === 'all'
      ? [...liveWin.live].filter(l => l.firstSlot > newestPlayed).reverse()
      : [];
  // In its card: the filter in the header; else above the table.
  const frame = (body: ReactNode, aside?: ReactNode) =>
    card ? (
      <SectionCard
        title={card.title}
        icon={card.icon}
        info={card.info}
        aside={aside}
      >
        {body}
      </SectionCard>
    ) : (
      <>
        {aside && (
          <div className="d-flex justify-content-end mb-2">{aside}</div>
        )}
        {body}
      </>
    );
  if (!legacy && playedN === 0 && upcomingN === 0 && !shown.length)
    return frame(
      <p className="fs-9 text-body-tertiary mb-0">
        No leader slots this epoch.
      </p>
    );
  const filterSelect = (
    <Form.Select
      size="sm"
      // Set into the header's padding (12 px above the ~16 px title
      // row, 8 below): centered, and the header no taller.
      className={`w-auto${card ? ' vx-header-control' : ''}`}
      value={filter}
      onChange={e => {
        setFilter(e.target.value as WindowsFilter);
        setPage(0);
        setBefores([null]);
      }}
      aria-label="Filter leader slots"
    >
      <option value="all">All leader slots</option>
      <option value="issues">Skips or Poor blocks</option>
      {/* Per kind: filtered locally on a full-list API, by the server
              once it reports per-kind counts. */}
      {(legacy || first?.poorWindows !== undefined) && (
        <>
          <option value="poor">Poor blocks only</option>
          <option value="skipped">Skipped slots only</option>
        </>
      )}
    </Form.Select>
  );
  return frame(
    <>
      {upcomingN > 0 && (
        <p className="fs-9 text-body-tertiary mb-2">
          {upcomingN.toLocaleString()} leader windows still ahead
          {nextSlot != null && `, next at slot ${nextSlot.toLocaleString()}`}
        </p>
      )}
      <Table
        responsive
        size="sm"
        className="data-table fs-9 mb-2"
        style={{
          opacity: loadingPage ? 0.55 : 1,
          transition: 'opacity 150ms'
        }}
        aria-busy={loadingPage}
      >
        <thead>
          <tr>
            <th title="Its 4 consecutive leader slots, by the first">
              Leader window
            </th>
            {timing ? (
              <>
                <th title="Its 4 blocks and the next leader's first (faint), each arrow the time in ms between the blocks either side, by the producers' block times: the first is the handoff from the previous leader, the last the handoff to the next. Colored against the cluster's median - in-window gaps against its slot, handoffs against its handoff: green within 10%, amber to 25%, red beyond. * across a skipped slot; ??ms: a block time is clamped (its producer's clock is off), so it can't be timed.">
                  Blocks and the time between them (ms)
                </th>
              </>
            ) : (
              <>
                <th>Slots</th>
                <th
                  className="text-end d-none d-sm-table-cell"
                  title="Online stake its blocks carried / online stake, over these 4 slots, as the Production score counts it: a block that carried 99.9%+ counts as full, a skipped slot as 0"
                >
                  Inclusion
                </th>
              </>
            )}
            {current && (
              <th className="text-end d-none d-sm-table-cell">When</th>
            )}
          </tr>
        </thead>
        <tbody>
          {/* Live, on the first page: the next windows and the one being
              produced (block / skipped only until its data is ingested). */}
          {liveRows.map(({ firstSlot, state }) => (
            <tr
              key={`live-${firstSlot}`}
              className={state === 'ahead' ? 'text-pending' : undefined}
            >
              <td className="font-monospace text-nowrap">
                <Link to={`/slot/${firstSlot}`}>
                  {firstSlot.toLocaleString()}
                </Link>
              </td>
              {timing ? (
                <>
                  <WindowTimeline
                    first={firstSlot}
                    h={state === 'ahead' ? null : handoffsOf(firstSlot)}
                    pace={pace}
                    who={who}
                  />
                </>
              ) : (
                <>
                  <td>
                    <div className="d-flex gap-1">
                      {Array.from({ length: 4 }, (_, k) => {
                        const slot = firstSlot + k;
                        const i =
                          liveWin.slotNow != null && slot <= liveWin.slotNow
                            ? liveWin.infos.get(slot)
                            : null;
                        return (
                          <SlotCell
                            key={slot}
                            s={
                              {
                                slot,
                                outcome: i?.outcome ?? 'unknown',
                                includedStakePpb: null,
                                notarStakePpb: null,
                                skipStakePpb: null
                              } as Slot
                            }
                          />
                        );
                      })}
                    </div>
                  </td>
                  <td className="text-end text-body-tertiary d-none d-sm-table-cell">
                    —
                  </td>
                </>
              )}
              <td className="text-end text-nowrap d-none d-sm-table-cell">
                {state === 'played' ? (
                  <span className="text-body-tertiary">
                    {liveWin.slotNow != null
                      ? when(
                          (firstSlot + 4 - liveWin.slotNow) * liveWin.slotSecs
                        )
                      : '—'}
                  </span>
                ) : state === 'now' ? (
                  <span className="text-success fw-semibold d-inline-flex align-items-center gap-1">
                    <span
                      className="d-inline-block rounded-circle bg-success vx-live-dot"
                      style={{ width: 8, height: 8 }}
                    />
                    Producing now
                  </span>
                ) : liveWin.slotNow != null ? (
                  <span className="text-body-tertiary">
                    {when((firstSlot - liveWin.slotNow) * liveWin.slotSecs)}
                  </span>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
          {shown.map(w => (
            <tr key={w.firstSlot}>
              <td className="font-monospace text-nowrap">
                <Link to={`/slot/${w.firstSlot}`}>
                  {w.firstSlot.toLocaleString()}
                </Link>
              </td>
              {timing ? (
                <>
                  <WindowTimeline
                    first={w.firstSlot}
                    h={handoffsOf(w.firstSlot)}
                    pace={pace}
                    who={who}
                  />
                </>
              ) : (
                <>
                  <td>
                    <div className="d-flex gap-1">
                      {w.slots.map(s => (
                        <SlotCell key={s.slot} s={s} />
                      ))}
                    </div>
                  </td>
                  <td className="text-end font-monospace d-none d-sm-table-cell">
                    {pct(windowInclusion(w))}
                  </td>
                </>
              )}
              {current && (
                <td className="text-end text-nowrap text-body-tertiary d-none d-sm-table-cell">
                  {liveWin.slotNow != null
                    ? when(
                        (w.firstSlot + 4 - liveWin.slotNow) * liveWin.slotSecs
                      )
                    : '—'}
                </td>
              )}
            </tr>
          ))}
          {!shown.length && !liveRows.length && (
            <tr>
              <td
                colSpan={(current ? 4 : 3) - (timing ? 1 : 0)}
                className="text-center text-body-tertiary py-3"
              >
                {filter === 'all'
                  ? 'No leader windows played yet.'
                  : filter === 'poor'
                    ? 'No Poor blocks.'
                    : filter === 'skipped'
                      ? 'No skipped slots.'
                      : 'No skips or Poor blocks.'}
              </td>
            </tr>
          )}
        </tbody>
      </Table>
      {pages > 1 && (
        <Pager
          page={pageIndex}
          pages={pages}
          total={total}
          pageSize={PAGE}
          shown={shown.length}
          prevDisabled={pageIndex === 0 || loadingPage}
          nextDisabled={
            loadingPage ||
            (legacy ? page >= pages - 1 : data.nextBeforeSlot == null)
          }
          onPrev={() =>
            legacy ? setPage(p => p - 1) : setBefores(b => b.slice(0, -1))
          }
          onNext={() =>
            legacy
              ? setPage(p => p + 1)
              : setBefores(b => [...b, data.nextBeforeSlot ?? null])
          }
        />
      )}
    </>,
    timing ? undefined : filterSelect
  );
};

export default ProducerWindowsTable;
