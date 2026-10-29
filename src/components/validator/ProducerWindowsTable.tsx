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
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Form, Table } from 'react-bootstrap';
import { Link } from 'react-router';
import useLiveWindows, { when } from 'hooks/useLiveWindows';

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
  current = false
}: {
  voteKey: string;
  epoch: number;
  /** Its identity: the leader schedule's key, for the live rows. */
  nodeAddress?: string | null;
  /** The current epoch: the window being produced and the next ones on
   *  top, live, and a When column. */
  current?: boolean;
}) => {
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
  if (!legacy && playedN === 0 && upcomingN === 0 && !shown.length)
    return (
      <p className="fs-9 text-body-tertiary mb-0">
        No leader slots this epoch.
      </p>
    );
  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-3 mb-2">
        {upcomingN > 0 && (
          <span className="fs-9 text-body-tertiary">
            {upcomingN.toLocaleString()} leader windows still ahead
            {nextSlot != null && `, next at slot ${nextSlot.toLocaleString()}`}
          </span>
        )}
        <Form.Select
          size="sm"
          className="w-auto ms-auto"
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
      </div>
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
            <th>Slots</th>
            <th
              className="text-end d-none d-sm-table-cell"
              title="Online stake its blocks carried / online stake, over these 4 slots, as the Production score counts it: a block that carried 99.9%+ counts as full, a skipped slot as 0"
            >
              Inclusion
            </th>
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
                colSpan={current ? 4 : 3}
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
    </>
  );
};

export default ProducerWindowsTable;
