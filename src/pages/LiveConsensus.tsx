import FeatherIcon from 'feather-icons-react';
import Badge from 'components/base/Badge';
import DelayedSpinner from 'components/common/DelayedSpinner';
import PageBreadcrumb, { Crumb } from 'components/common/PageBreadcrumb';
import SectionCard from 'components/common/SectionCard';
import SlotPlayer, { PausedBadge } from 'components/live/SlotPlayer';
import PlaybackBar from 'components/live/PlaybackBar';
import { SlotDotLegend } from 'components/live/slotDots';
import ConsensusHealth from 'components/live/ConsensusHealth';
import LeaderMap from 'components/live/LeaderMap';
import RecentLeadersTable from 'components/live/RecentLeadersTable';
import useValidatorGeo from 'hooks/useValidatorGeo';
import useMediaQuery from 'hooks/useMediaQuery';
import StatCard from 'components/common/StatCard';
import UntrackedState from 'components/common/UntrackedState';
import { fetchSlots } from 'helpers/slotContext';
import useConsensus from 'hooks/useConsensus';
import HaltRunUpCard from 'components/live/HaltRunUpCard';
import RestartAnnouncementCard from 'components/live/RestartAnnouncementCard';
import RestartCard from 'components/live/RestartCard';
import useRestartAnnouncement from 'hooks/useRestartAnnouncement';
import useAnnouncements from 'hooks/useAnnouncements';
import AnnouncementsTable, {
  isSuperseded
} from 'components/features/announcements';
import { formatDuration as duration } from 'helpers/utils';
import { clusterHaltOf, useEpochLive } from 'hooks/useIngestion';
import useLiveConsensus from 'hooks/useLiveConsensus';
import { LiveSlot, SlotInfo } from 'providers/vortex-schemas';
import { VortexDataContext } from 'providers/VortexDataProvider';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Col, Row, Table } from 'react-bootstrap';
import { Link } from 'react-router';

const breadcrumbItems: Crumb[] = [
  { label: 'Home', url: '/' },
  { label: 'Cluster Status', active: true }
];

const POLL_MS = 2_000;
// Hover hold: how long the pointer must rest before playback holds, and
// how long after it leaves before playback resumes.
const HOLD_DELAY_MS = 400;
const RELEASE_MS = 150;
const RECENT = 128; // slots in the grid
const LEADER_ROWS = 10;
const GRID_ROWS = 3;
// Playhead: trails the newest ingested slot by PLAY_GAP (votes ride 8
// slots later, finalization a few after) and starts PLAY_LEAD further back
// so it plays smoothly between ingest writes.
const PLAY_GAP = 10;
const PLAY_LEAD = 16;
// No API response for this long: offline. Chain slot or ingested tip
// standing still this long: stalled.
const OFFLINE_MS = 15_000;
const STALL_SECS = 20;

type Stuck = { kind: 'offline' | 'chain' | 'data'; secs: number };

const STUCK_TEXT: Record<Stuck['kind'], (secs: number) => string> = {
  offline: s =>
    `Can't reach the API (no response for ${s}s). Retrying - what's shown is from before.`,
  chain: s =>
    `The cluster has halted: no new slots for ${duration(s)}. What's shown is the last slots before it stopped; playback resumes when the cluster restarts.`,
  data: s =>
    `The chain is moving, but no new slot data has arrived for ${s}s (ingestion stalled). Playback resumes when it does.`
};
// After a hover hold, the playhead fast-forwards a slot per FF_MS.
const FF_MS = 40;
// Playhead this far behind the data while playing: jump, don't crawl.
const JUMP_BEHIND = 256;
// A hold that ends further behind than this jumps back to live instead
// of fast-forwarding (three leader windows).
const CATCH_UP_MAX = 12;
const WINDOW = 4;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`;
const pctPpb = (v: number | null | undefined, digits = 1) =>
  v == null ? '—' : `${(v / 1e7).toFixed(digits)}%`;

// Short certificate names for the in-flight table.
const CERT_LABEL: Record<string, string> = {
  notarize: 'notar',
  notarizeFallback: 'notar-fb',
  skip: 'skip',
  skipFallback: 'skip-fb',
  fastFinalize: 'fast-final',
  finalize: 'final'
};

const STATUS_BG: Record<string, 'info' | 'primary' | 'success' | 'warning'> = {
  voting: 'info',
  notarized: 'primary',
  finalized: 'success',
  skipped: 'warning'
};

/**
 * What the cluster is doing now. The chain's latest slots (/slots, a few
 * seconds behind the tip, refreshed every 2 s) as a grid of leader
 * windows and a table - every slot links to its page - plus, where the
 * API's node runs the vote-pool RPC, the slots still in flight
 * (/consensus/live): votes arriving, certificates forming, who hasn't
 * voted yet. Alpenglow only.
 */
const LiveConsensus = () => {
  // From xl the Leaders map fills the Current Leader card's height.
  const isXl = useMediaQuery('(min-width: 1200px)');
  const context = useContext(VortexDataContext);
  const { alpenglowActive, phase, known, unavailable } = useConsensus();
  const live = useEpochLive(alpenglowActive, POLL_MS);
  const pool = useLiveConsensus();
  // Data (votes, outcomes) is ingested in batches every ~15-25 s; the
  // chain's own position comes from progress (re-read every few seconds
  // server-side) and is advanced between readings at the measured slot
  // time, so new slots appear as they happen and fill in when ingested.
  // The ingested tip only moves forward (vortex-data's contract); if an
  // older API reports it going backwards (an ingestor restarted inside a
  // re-ingest), keep the highest seen rather than jump the page back.
  const reportedTip = live.ingestion?.footers?.lastSlot ?? null;
  const maxTip = useRef<number | null>(null);
  if (
    reportedTip != null &&
    (maxTip.current == null || reportedTip > maxTip.current)
  )
    maxTip.current = reportedTip;
  const ingested = reportedTip != null ? maxTip.current : null;
  const [now, setNow] = useState(() => Date.now());
  // When the page started counting: opened, or last shown again - a
  // hidden tab doesn't poll, so time spent hidden (or asleep) isn't the
  // API failing to answer.
  const pageStart = useRef(Date.now());
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible')
        pageStart.current = Date.now();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), POLL_MS);
    return () => clearInterval(id);
  }, []);
  const p = live.progress;
  const halt = clusterHaltOf(live, now);
  const restartPost = useRestartAnnouncement(halt);
  const announcements = useAnnouncements();
  // A restart the cluster has finished is history, and so is an upgrade
  // a later post for the same client replaced: not listed here.
  const current = (announcements ?? []).filter(
    a => a.restart?.finished !== true && !isSuperseded(a, announcements ?? [])
  );
  const chainTip =
    p?.absoluteSlot != null
      ? p.readAt != null && p.slotSeconds
        ? p.absoluteSlot +
          Math.max(0, Math.floor((now / 1000 - p.readAt) / p.slotSeconds))
        : p.absoluteSlot
      : null;
  const tip = chainTip ?? ingested;

  // ---- Stuck states ------------------------------------------------------
  // When did the chain's slot and the ingested tip last move? With 'now'
  // ticking, that tells an unreachable API, a halted chain and stalled
  // ingestion apart.
  const chainSlot = p?.absoluteSlot ?? null;
  const moved = useRef({
    chain: null as number | null,
    chainAt: Date.now(),
    data: null as number | null,
    dataAt: Date.now()
  });
  if (chainSlot != null && chainSlot !== moved.current.chain)
    moved.current = { ...moved.current, chain: chainSlot, chainAt: now };
  if (ingested != null && ingested !== moved.current.data)
    moved.current = { ...moved.current, data: ingested, dataAt: now };
  const stuck: Stuck | null = (() => {
    // The shared poller keeps its last answer between pages: one from
    // before this page opened doesn't count against it (coming back after
    // a while would flash "can't reach the API" until the fresh answer
    // lands) - measure from whichever is later.
    const lastOk = Math.max(live.okAt ?? 0, pageStart.current);
    if (now - lastOk > OFFLINE_MS)
      return {
        kind: 'offline',
        secs: Math.round((now - lastOk) / 1000)
      };
    // The cluster has halted (the API reads fine, the slot doesn't move):
    // say so straight away, timed from the last slot - not after a stall
    // timer that starts when the page opens.
    if (halt)
      return { kind: 'chain', secs: Math.round(now / 1000 - halt.since) };
    const chainStill = (now - moved.current.chainAt) / 1000;
    // Halted only if the API's reading is fresh (it re-reads the chain
    // every few seconds) - a stale reading isn't the chain's fault.
    const readingFresh =
      p?.readAt != null && now / 1000 - p.readAt < STALL_SECS / 2;
    if (chainSlot != null && readingFresh && chainStill > STALL_SECS)
      return { kind: 'chain', secs: Math.round(chainStill) };
    const dataStill = (now - moved.current.dataAt) / 1000;
    if (ingested != null && dataStill > STALL_SECS)
      return { kind: 'data', secs: Math.round(dataStill) };
    return null;
  })();

  // The last RECENT ingested slots (window-aligned, so the grid's groups
  // are leader windows), then the slots since up to the chain tip, which
  // show as 'not yet' until they're ingested (a few seconds behind). Only the ingested
  // part is fetched, and only when the ingested tip moves; fetchSlots
  // caches settled slots, so that's just the newest, still-filling ones.
  const dataEnd = ingested ?? tip;
  // Grid geometry: fixed rows of leader windows anchored to absolute slot
  // numbers (fewer windows per row on phones).
  // Below md (Bootstrap's 768px): fewer windows a row.
  const narrow = useMediaQuery('(max-width: 767.98px)');
  const rowWindows = narrow ? 6 : 16;
  const rowSlots = rowWindows * WINDOW;
  const range = useMemo(() => {
    if (dataEnd == null || tip == null) return null;
    const first = dataEnd - RECENT + 1;
    // Fetch from the grid's top row (one extra, retiring) or the last
    // RECENT ingested slots, whichever starts earlier.
    const gridStart = (Math.floor(tip / rowSlots) - GRID_ROWS) * rowSlots;
    const start = Math.min(gridStart, first - (first % WINDOW));
    return {
      start,
      dataEnd,
      end: Math.min(Math.max(tip, dataEnd), start + 400)
    };
  }, [dataEnd, tip, rowSlots]);
  const fetchStart = range?.start;
  const [infos, setInfos] = useState<Map<number, SlotInfo | null>>(new Map());
  useEffect(() => {
    if (fetchStart == null || dataEnd == null) return;
    let alive = true;
    const slots = Array.from(
      { length: dataEnd - fetchStart + 1 },
      (_, i) => fetchStart + i
    );
    fetchSlots(slots).then(
      m => {
        if (!alive) return;
        // Merge, keeping the newest ~1,000 slots (the playhead can step
        // back past the grid).
        setInfos(prev => {
          const next = new Map([...prev, ...m]);
          if (next.size > 1000) {
            const keep = [...next.keys()].sort((a, b) => b - a).slice(0, 1000);
            return new Map(keep.map(k => [k, next.get(k) ?? null]));
          }
          return next;
        });
      },
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, [fetchStart, dataEnd]);

  // ---- Playback: one slot at a time at the cluster's slot pace ----------
  // The playhead trails the newest ingested slot by PLAY_GAP, so a slot's
  // votes (carried 8 slots later) and finalization are in when it shows;
  // caught up, it waits rather than run ahead of the data.
  const stepMs = Math.round((p?.slotSeconds ?? 0.4) * 1000);
  // ...and never past what the browser has actually received: the newest
  // slot loaded with its votes. The ingestion tip can run ahead of the
  // /slots responses when the API is slow, which played into empty slots.
  const loadedEdge = useMemo(() => {
    if (dataEnd == null) return null;
    for (let s = dataEnd; s > dataEnd - 600; s--) {
      const i = infos.get(s);
      if (i?.outcome && (i.votes || i.outcome !== 'block')) return s;
    }
    return null;
  }, [infos, dataEnd]);
  const playEdge =
    dataEnd != null && loadedEdge != null
      ? Math.min(dataEnd - PLAY_GAP, loadedEdge)
      : null;
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(true);
  // Hovering the Current Leader or Recent Leaders sections holds playback
  // (what's under the pointer stays put); leaving fast-forwards back to
  // the live edge, a slot per FF_MS, then resumes the cluster's pace.
  // The hold starts HOLD_DELAY_MS after the pointer arrives (passing
  // over the cards doesn't stop playback) and ends RELEASE_MS after it
  // leaves (moving between the two sections keeps it held).
  const [hovering, setHovering] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveringRef = useRef(false);
  hoveringRef.current = hovering;
  const clearHoverTimer = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };
  useEffect(() => clearHoverTimer, []);
  const hold = {
    onMouseEnter: () => {
      clearHoverTimer();
      if (!hoveringRef.current)
        hoverTimer.current = setTimeout(() => setHovering(true), HOLD_DELAY_MS);
    },
    onMouseLeave: () => {
      clearHoverTimer();
      if (!hoveringRef.current) return;
      hoverTimer.current = setTimeout(() => {
        // A hold ending: fast-forward from where it stopped - or, after a
        // long hold, jump back to live rather than race through dozens of
        // slots.
        const edge = edgeRef.current;
        const c = cursorRef.current;
        if (edge != null && c != null && edge - PLAY_LEAD - c > CATCH_UP_MAX) {
          catchUp.current = false;
          setCursor(edge - PLAY_LEAD);
        } else catchUp.current = true;
        setHovering(false);
      }, RELEASE_MS);
    }
  };
  const catchUp = useRef(false);
  const cursorRef = useRef<number | null>(null);
  const edgeRef = useRef(playEdge);
  edgeRef.current = playEdge;
  cursorRef.current = cursor;
  // Halted: no slots are coming, so there's nothing to play through -
  // the playhead sits on the last slot loaded (no PLAY_GAP wait for votes
  // that won't land).
  const halted = !!halt;
  // The last slot with any data: its votes would have come in blocks that
  // never were, so don't wait for them.
  const lastEdge = useMemo(() => {
    if (!halted || dataEnd == null) return loadedEdge ?? playEdge;
    for (let s = dataEnd; s > dataEnd - 600; s--)
      if (infos.get(s)?.outcome) return s;
    return loadedEdge ?? playEdge;
  }, [halted, dataEnd, infos, loadedEdge, playEdge]);
  useEffect(() => {
    if (cursor == null && playEdge != null)
      setCursor(halted && lastEdge != null ? lastEdge : playEdge - PLAY_LEAD);
  }, [cursor, playEdge, halted, lastEdge]);
  useEffect(() => {
    if (halted && lastEdge != null) setCursor(lastEdge);
  }, [halted, lastEdge]);
  const held = playing && hovering;
  useEffect(() => {
    if (!playing || hovering || halted) return;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      setCursor(c => {
        const edge = edgeRef.current;
        if (c == null || edge == null || c >= edge) {
          catchUp.current = false;
          return c;
        }
        // Far behind the data (it jumped - an ingest catching up): jump
        // forward rather than crawl through history at the cluster's pace.
        if (edge - c > JUMP_BEHIND) {
          catchUp.current = false;
          return edge - PLAY_LEAD;
        }
        if (edge - (c + 1) <= PLAY_LEAD) catchUp.current = false;
        return c + 1;
      });
      t = setTimeout(tick, catchUp.current ? FF_MS : stepMs);
    };
    t = setTimeout(tick, catchUp.current ? FF_MS : stepMs);
    return () => clearTimeout(t);
  }, [playing, hovering, stepMs, halted]);
  const step = (d: number) => {
    setPlaying(false);
    setCursor(c => (c == null ? c : c + d));
  };
  const toLive = () => {
    if (halted && lastEdge != null) setCursor(lastEdge);
    else if (playEdge != null) setCursor(playEdge - PLAY_LEAD);
    setPlaying(true);
  };
  // Play always resumes from the live edge, like a fresh page load (no
  // catching up through what was missed); pause just stops.
  const togglePlay = () => (playing ? setPlaying(false) : toLive());
  // Space / arrows (not while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // Whatever the visible grid rows and the leaders table need around the
  // playhead (after stepping back, or a stale playhead) - fetch the slots
  // that aren't loaded, whenever the playhead's row or the data tip moves.
  const cursorRow = cursor != null ? Math.floor(cursor / rowSlots) : null;
  const neededFrom =
    cursorRow != null ? (cursorRow - GRID_ROWS) * rowSlots : null;
  const neededTo =
    cursor != null ? Math.min(cursor + WINDOW, dataEnd ?? cursor) : null;
  const missing = useMemo(() => {
    if (neededFrom == null || neededTo == null) return [];
    const out: number[] = [];
    for (let s = neededFrom; s <= neededTo; s++) if (!infos.has(s)) out.push(s);
    return out;
  }, [neededFrom, neededTo, infos]);
  const missingKey = missing.length
    ? `${missing[0]}-${missing[missing.length - 1]}`
    : '';
  useEffect(() => {
    if (!missingKey) return;
    let alive = true;
    fetchSlots(missing).then(
      m => alive && setInfos(prev => new Map([...prev, ...m])),
      () => undefined
    );
    return () => {
      alive = false;
    };
    // Keyed by the missing range, not the array (new each render).
  }, [missingKey]);

  // Back from a hidden / idle tab: timers were throttled, so the playhead
  // is stale - jump back to the live edge if it fell a couple of rows
  // behind (and was playing).
  const liveRef = useRef({ cursor, playEdge, playing, rowSlots, halted });
  liveRef.current = { cursor, playEdge, playing, rowSlots, halted };
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const v = liveRef.current;
      if (
        v.playing &&
        !v.halted &&
        v.cursor != null &&
        v.playEdge != null &&
        v.playEdge - v.cursor > 2 * v.rowSlots
      )
        setCursor(v.playEdge - PLAY_LEAD);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Where validators are, for the leader map and the table's Location.
  const geo = useValidatorGeo();
  // Leaders of the latest windows up to the playhead, newest first.
  const recentLeaders = useMemo(() => {
    if (cursor == null) return [];
    const first = cursor - (cursor % WINDOW);
    const out: string[] = [];
    for (let w = 0; w < 12; w++) {
      const l = infos.get(first - w * WINDOW)?.leader;
      if (l && out[out.length - 1] !== l) out.push(l);
    }
    return out;
  }, [cursor, infos]);

  const dir = context?.validatorDirectoryState;
  const nameOf = (node: string | null | undefined) =>
    node ? (dir?.byNodeAddress?.get(node)?.name ?? short(node)) : '—';

  const slots = useMemo(
    () =>
      range
        ? Array.from(
            { length: range.end - range.start + 1 },
            (_, i) => range.start + i
          )
        : [],
    [range]
  );
  const stats = useMemo(() => {
    const known = slots
      .filter(s => dataEnd == null || s <= dataEnd)
      .map(s => infos.get(s))
      .filter((i): i is SlotInfo => !!i?.outcome);
    const blocks = known.filter(i => i.outcome === 'block');
    const skipped = known.filter(i => i.outcome === 'skipped').length;
    const lags = blocks
      .map(i => i.finalization)
      .filter(f => f?.lagSlots != null);
    const ms = lags.map(f => f?.lagMs).filter((m): m is number => m != null);
    // Fast path: of blocks whose finalization is known.
    const finalized = blocks.filter(i => i.finalization);
    const fast = finalized.filter(
      i => i.finalization?.directPath === 'fast'
    ).length;
    const notar = blocks
      .map(i => i.votes?.notarStakePpb)
      .filter((v): v is number => v != null);
    const mean = (a: number[]) =>
      a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    return {
      known: known.length,
      skipped,
      lagSlots: mean(lags.map(f => f!.lagSlots!)),
      lagMs: mean(ms),
      lagMsBlocks: ms.length,
      notar: mean(notar),
      fast,
      finalizedBlocks: finalized.length
    };
  }, [slots, infos, dataEnd]);

  const header = (
    <Row className="page-header align-items-start justify-content-between g-3">
      <Col xs="auto">
        <h3>Cluster Status</h3>
        <p className="text-body-tertiary lh-sm mb-0 mt-1">
          The cluster&apos;s latest slots as they happen
        </p>
      </Col>
    </Row>
  );

  if (unavailable)
    return (
      <div>
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="mb-9">
          {header}
          <UntrackedState>The API is unavailable right now.</UntrackedState>
        </div>
      </div>
    );

  if (known && !alpenglowActive)
    return (
      <div>
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="mb-9">
          {header}
          <p className="text-body-tertiary">
            Alpenglow isn&apos;t active on this cluster yet
            {phase ? ` (${phase})` : ''}: the live view starts with it.
          </p>
        </div>
      </div>
    );

  return (
    <div>
      <PageBreadcrumb items={breadcrumbItems} />
      <div className="mb-9 d-flex flex-column gap-3">
        {header}

        <PlaybackBar
          slot={cursor}
          epoch={live.epoch}
          epochPct={
            // Where the SHOWN slot is in the epoch (not the chain tip).
            live.progress &&
            live.progress.absoluteSlot != null &&
            cursor != null
              ? ((live.progress.slotIndex -
                  (live.progress.absoluteSlot - cursor)) /
                  live.progress.slotsInEpoch) *
                100
              : null
          }
          behindSecs={
            // The data trailing the chain by more than a couple of minutes
            // (an ingest backlog) is worth saying; a few seconds isn't.
            ingested != null && tip != null && p?.slotSeconds
              ? (tip - ingested) * p.slotSeconds
              : null
          }
          playing={playing}
          held={held}
          stepMs={stepMs}
          alert={
            <ConsensusHealth
              pool={pool}
              nameOf={nameOf}
              mode="line"
              halted={!!halt}
              table={() => null}
            />
          }
          stuck={stuck ? stuck.kind : null}
          stuckSecs={stuck?.secs ?? null}
          onToggle={togglePlay}
          onStep={step}
        />
        {restartPost && <RestartAnnouncementCard post={restartPost} />}
        {halt?.restart && (
          <RestartCard
            halt={halt}
            announcedShredVersion={
              restartPost?.restart?.expectedShredVersion ?? null
            }
          />
        )}
        {halt && <HaltRunUpCard halt={halt} nameOf={nameOf} />}
        {/* A halt is already said above every page (ClusterHaltBanner). */}
        {stuck && !halt && (
          <div
            className={`d-flex align-items-start gap-2 rounded border px-3 py-2 fs-9 ${
              stuck.kind === 'data'
                ? 'bg-warning-subtle border-warning-subtle'
                : 'bg-danger-subtle border-danger-subtle'
            }`}
            role="status"
          >
            <FeatherIcon
              icon={stuck.kind === 'offline' ? 'wifi-off' : 'alert-triangle'}
              size={16}
              className={`flex-shrink-0 mt-1 ${stuck.kind === 'data' ? 'text-warning' : 'text-danger'}`}
            />
            <span>{STUCK_TEXT[stuck.kind](stuck.secs)}</span>
          </div>
        )}

        {current.length > 0 && (
          <SectionCard
            title="Announcements"
            icon="volume-2"
            info="Restarts, upgrades and feature activations from Solana Tech's announcement channel, newest first (a restart the cluster has finished is left out). Check the post before acting."
          >
            <AnnouncementsTable
              announcements={current.slice(0, 10)}
              showCluster={false}
            />
          </SectionCard>
        )}

        {/* Live views: nothing to show while halted (the halt cards above
            take their place). */}
        {!halt && (
          <>
            <Row className="g-3">
              <Col xs={6} md>
                <StatCard
                  label="Recent Skip Rate"
                  value={
                    stats.known
                      ? `${((stats.skipped / stats.known) * 100).toFixed(1)}%`
                      : '—'
                  }
                  sublabel={`${stats.skipped} of the last ${stats.known} slots`}
                />
              </Col>
              <Col xs={6} md>
                <StatCard
                  label="Avg Finalization"
                  value={
                    stats.lagMs != null
                      ? `${Math.round(stats.lagMs).toLocaleString()} ms`
                      : '—'
                  }
                  sublabel={
                    stats.lagSlots != null ? (
                      <span
                        title={`Mean time to finalization over the last ${stats.lagMsBlocks} finalized blocks, and the mean lag in slots`}
                      >
                        {stats.lagSlots.toFixed(2)} slots
                      </span>
                    ) : undefined
                  }
                />
              </Col>
              <Col xs={6} md>
                <StatCard
                  label="Notarize Stake"
                  value={pctPpb(stats.notar)}
                  sublabel="mean, in reward certificates"
                />
              </Col>
              <Col xs={6} md>
                <StatCard
                  label="Fast Finalized"
                  value={
                    stats.finalizedBlocks
                      ? `${((stats.fast / stats.finalizedBlocks) * 100).toFixed(1)}%`
                      : '—'
                  }
                  sublabel={
                    <span title="Blocks finalized on the fast (80% of stake, one round) path">
                      {stats.fast} of {stats.finalizedBlocks} blocks
                    </span>
                  }
                />
              </Col>
            </Row>

            <Row className="g-3">
              <Col xs={12} xl={7} {...hold}>
                <SlotPlayer
                  held={held}
                  slot={cursor}
                  infoOf={s => infos.get(s)}
                  nameOf={nameOf}
                />
              </Col>
              <Col xs={12} xl={5}>
                {/* From xl up: Current Leader's height, the map filling
                    it (wider screens: more space at its sides). */}
                <div className="fit-row-height-xl">
                  <SectionCard
                    title="Leaders"
                    icon="globe"
                    info="The current leader pulses; recent leaders fade with age, and a ball flies along each hand-off. Gray dots are every validator, sized by stake. Locations from IP geolocation (DB-IP)."
                  >
                    <div className="leader-map-fill">
                      <LeaderMap
                        geo={geo}
                        leaders={recentLeaders}
                        nameOf={nameOf}
                        fill={isXl}
                      />
                    </div>
                  </SectionCard>
                </div>
              </Col>
            </Row>

            <ConsensusHealth
              pool={pool}
              nameOf={nameOf}
              mode="detail"
              halted={!!halt}
              table={(slots, stale) => (
                <InFlight pool={slots} stale={stale} nameOf={nameOf} />
              )}
            />

            <div {...hold}>
              <SectionCard
                title="Recent Leaders"
                icon="list"
                highlight={held}
                badge={held ? <PausedBadge /> : undefined}
              >
                <RecentLeadersTable
                  infos={infos}
                  playhead={cursor}
                  windows={LEADER_ROWS}
                  geo={geo}
                  nameOf={nameOf}
                />
                <div className="mt-2 px-2">
                  <SlotDotLegend />
                </div>
              </SectionCard>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/** Slots still in flight in the node's vote pool, newest first. */
const InFlight = ({
  pool,
  stale,
  nameOf
}: {
  pool: LiveSlot[];
  stale: boolean;
  nameOf: (node: string | null | undefined) => string;
}) => (
  <>
    {stale && (
      <p className="fs-9 text-warning mb-2">
        Live data paused: this snapshot is more than 10 s old.
      </p>
    )}
    <Table responsive size="sm" className="data-table fs-9 mb-0">
      <thead>
        <tr>
          <th>Slot</th>
          <th>Leader</th>
          <th>Status</th>
          <th className="text-end">Notarize</th>
          <th className="text-end">Skip</th>
          <th className="text-end">Finalize</th>
          <th className="text-end">Not voted</th>
          <th
            className="text-end"
            title="Certificates as they formed, ms after the slot's first vote"
          >
            Certificates (ms)
          </th>
        </tr>
      </thead>
      <tbody>
        {pool.map(s => {
          const notar = s.notarize.reduce((a, v) => a + v.stakePpb, 0);
          return (
            <tr key={s.slot}>
              <td className="font-monospace">
                <Link to={`/slot/${s.slot}`}>{s.slot.toLocaleString()}</Link>
              </td>
              <td className="text-nowrap">{nameOf(s.leader)}</td>
              <td>
                <Badge variant="soft" bg={STATUS_BG[s.status] ?? 'info'}>
                  {s.status}
                </Badge>
                {s.split && (
                  <span
                    className="text-danger fs-10 ms-1"
                    title="Notarize votes for more than one block version"
                  >
                    split
                  </span>
                )}
              </td>
              <td className="text-end font-monospace">
                {s.notarize.length ? pctPpb(notar) : '—'}
              </td>
              <td className="text-end font-monospace">
                {pctPpb(s.skip?.stakePpb)}
              </td>
              <td className="text-end font-monospace">
                {pctPpb(s.finalize?.stakePpb)}
              </td>
              <td className="text-end font-monospace text-nowrap">
                {s.notVoted
                  ? `${s.notVoted.voters} · ${pctPpb(s.notVoted.stakePpb)}`
                  : '—'}
              </td>
              <td className="text-end font-monospace text-nowrap">
                {s.certificates.length
                  ? s.certificates
                      .map(
                        c =>
                          `${CERT_LABEL[c.kind] ?? c.kind}${c.formedMs != null ? ` ${c.formedMs}` : ''}`
                      )
                      .join(' · ')
                  : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  </>
);

export default LiveConsensus;
