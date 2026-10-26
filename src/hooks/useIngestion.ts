import { noteApiFailure, noteApiSuccess } from 'helpers/apiHealth';
import { noteIngestTip } from 'helpers/slotContext';
import { API_ENDPOINT } from 'helpers/apiEndpoint';
import {
  ChainRestart,
  ChainState,
  EpochProgress,
  EpochTotals,
  Ingestion,
  currentEpochResponseSchema
} from 'providers/vortex-schemas';
import { z } from 'zod';

type CurrentEpochResponse = z.infer<typeof currentEpochResponseSchema>;
import { useEffect, useState } from 'react';

const REFRESH_MS = 60_000;

export interface EpochLive {
  /** A response has arrived (the fields below may still be null). */
  loaded: boolean;
  epoch: number | null;
  ingestion: Ingestion | null;
  progress: EpochProgress | null;
  totals: EpochTotals | null;
  /** Whether the cluster is moving (null on APIs without it). */
  chain: ChainState | null;
  /** When the last response arrived (ms); null before the first. */
  okAt: number | null;
}

const EMPTY: EpochLive = {
  loaded: false,
  epoch: null,
  ingestion: null,
  progress: null,
  totals: null,
  chain: null,
  okAt: null
};

/**
 * One poller for every component that shows these: a single request at a
 * time, at the shortest interval any mounted subscriber asks for, skipped
 * while the tab is hidden (and re-run when it shows again). A subscriber
 * joining gets the last answer at once, and a fetch only if that answer
 * is older than its interval.
 */
const store = {
  value: EMPTY,
  subs: new Map<number, { ms: number; set: (v: EpochLive) => void }>(),
  nextId: 0,
  timer: null as ReturnType<typeof setInterval> | null,
  timerMs: 0,
  inflight: null as Promise<void> | null,
  /** The last full answer (for the provider's epoch / status). */
  parsed: null as CurrentEpochResponse | null,
  error: null as unknown
};
const visible = () =>
  typeof document === 'undefined' || document.visibilityState !== 'hidden';
const load = () =>
  (store.inflight ??= (async () => {
    try {
      const res = await fetch(`${API_ENDPOINT}/epochs/current`, {
        signal: AbortSignal.timeout(5_000)
      }).catch(e => {
        noteApiFailure(e);
        throw e;
      });
      if (!res.ok) {
        // A gateway error is the API being away, not an answer.
        noteApiFailure({
          isAxiosError: true,
          response: { status: res.status }
        });
        throw new Error(`epochs/current ${res.status}`);
      }
      noteApiSuccess();
      const parsed = currentEpochResponseSchema.parse(await res.json());
      store.parsed = parsed;
      store.error = null;
      noteIngestTip(parsed.ingestion?.footers?.lastSlot);
      store.value = {
        loaded: true,
        epoch: parsed.epoch,
        ingestion: parsed.ingestion ?? null,
        progress: parsed.progress ?? null,
        totals: parsed.totals ?? null,
        chain: parsed.chain ?? null,
        okAt: Date.now()
      };
      store.subs.forEach(s => s.set(store.value));
    } catch (e) {
      // keep what we had; the next refresh tries again
      store.error = e;
    } finally {
      store.inflight = null;
    }
  })());

/**
 * /epochs/current through the shared poller (a request already running is
 * reused): the provider's startup read, so a page's first poll and it are
 * one call. Throws when the API can't answer.
 */
export const fetchEpochCurrent = async (): Promise<CurrentEpochResponse> => {
  await load();
  if (!store.parsed || store.error) throw store.error ?? new Error('no answer');
  return store.parsed;
};
const reschedule = () => {
  const ms = Math.min(...[...store.subs.values()].map(s => s.ms));
  if (store.timer && store.timerMs === ms) return;
  if (store.timer) clearInterval(store.timer);
  store.timer = null;
  if (!Number.isFinite(ms)) return;
  store.timerMs = ms;
  store.timer = setInterval(() => {
    if (visible()) void load();
  }, ms);
};
const onVisibility = () => {
  if (visible() && store.subs.size) void load();
};
const subscribe = (ms: number, set: (v: EpochLive) => void) => {
  const id = store.nextId++;
  if (!store.subs.size && typeof document !== 'undefined')
    document.addEventListener('visibilitychange', onVisibility);
  store.subs.set(id, { ms, set });
  reschedule();
  const age =
    store.value.okAt == null ? Infinity : Date.now() - store.value.okAt;
  if (age >= ms) void load();
  else set(store.value);
  return () => {
    store.subs.delete(id);
    reschedule();
    if (!store.subs.size && typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', onVisibility);
  };
};

/**
 * The live parts of /epochs/current - data freshness (how far the block
 * and vote ingestors have got) and epoch progress - re-checked every
 * minute while a page shows them (the API refreshes them every 15 s).
 * Each is null until loaded, or on APIs without the field.
 */
export const useEpochLive = (
  enabled = true,
  refreshMs = REFRESH_MS
): EpochLive => {
  const [live, setLive] = useState<EpochLive>(store.value);
  useEffect(() => {
    if (!enabled) return;
    return subscribe(refreshMs, setLive);
  }, [enabled, refreshMs]);
  return live;
};

/** Data freshness only (see useEpochLive). */
const useIngestion = (enabled = true): Ingestion | null =>
  useEpochLive(enabled).ingestion;

export default useIngestion;

/** No new slot for this long while the API is reading fine: halted. */
export const HALT_SECS = 90;

export interface ClusterHalt {
  /** When the chain last advanced (unix s): the API's last slot reading. */
  since: number;
  /** The last slot it reached. */
  slot: number;
  /** The last finalized slot, when the API says. */
  finalizedSlot: number | null;
  /** Stake by advertised shred version while halted (the API's chain
   *  field), or null. */
  restart: ChainRestart | null;
}

/**
 * Whether the cluster has halted, from /epochs/current: its `chain`
 * verdict, or on an API without one, from its slot reading
 * (progress.readAt moves only when the slot does) is over HALT_SECS old
 * while the API's other reading (totals.readAt) is fresh - so it's the
 * chain that stopped, not the API's reader.
 */
export const clusterHaltOf = (
  live: EpochLive,
  nowMs = Date.now()
): ClusterHalt | null => {
  // The API's own verdict when it gives one: 'halted' from the chain;
  // 'running', or 'stale' (its writer is silent - nothing about the
  // cluster), aren't a halt.
  const c = live.chain;
  if (c)
    return c.state === 'halted' && c.lastSlot != null
      ? {
          since: c.haltedSince ?? c.lastSlotAt ?? nowMs / 1000,
          slot: c.lastSlot,
          finalizedSlot: c.lastFinalizedSlot,
          restart: c.restart
        }
      : null;
  const p = live.progress;
  const totalsAt = live.totals?.readAt;
  if (p?.readAt == null || p.absoluteSlot == null || totalsAt == null)
    return null;
  const now = nowMs / 1000;
  return now - p.readAt > HALT_SECS && now - totalsAt < HALT_SECS
    ? {
        since: p.readAt,
        slot: p.absoluteSlot,
        finalizedSlot: null,
        restart: null
      }
    : null;
};

/** The cluster's halt, if it has halted (see clusterHaltOf), re-checked
 *  every 15 s. */
export const useClusterHalt = (enabled = true): ClusterHalt | null => {
  const live = useEpochLive(enabled);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [enabled]);
  return clusterHaltOf(live, now);
};
