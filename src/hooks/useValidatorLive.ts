import axios from 'axios';
import { API_ENDPOINT } from 'helpers/apiEndpoint';
import { noteApiFailure, noteApiSuccess } from 'helpers/apiHealth';
import {
  ValidatorLive,
  ValidatorLiveSlot,
  validatorLiveSchema
} from 'providers/vortex-schemas';
import { useEffect, useRef, useState } from 'react';

/** Slots the strip keeps: enough leader windows to fill a wide row. */
export const LIVE_SLOTS = 400;

/**
 * Polls /consensus/validator/live every `intervalMs` while `enabled` and
 * the tab is visible, keeping the last LIVE_SLOTS slots. The first poll
 * takes the API's most (256 rows, sinceSlot 0); each later one asks for
 * slots after the previous response's finalThroughSlot (rows after it can
 * still change) and replaces the rows it gets back. `status`: 'loading',
 * 'ok', 'notAdmitted' (404), or 'unavailable' (the API doesn't serve it /
 * failed).
 */
const useValidatorLive = (
  voteKey: string | null | undefined,
  enabled: boolean,
  intervalMs = 1000
) => {
  const [slots, setSlots] = useState<ValidatorLiveSlot[]>([]);
  const [meta, setMeta] = useState<
    (Omit<ValidatorLive, 'slots'> & { receivedAt: number }) | null
  >(null);
  const [status, setStatus] = useState<
    'loading' | 'ok' | 'notAdmitted' | 'unavailable'
  >('loading');
  const since = useRef<number | null>(null);

  useEffect(() => {
    setSlots([]);
    setMeta(null);
    setStatus('loading');
    since.current = null;
    if (!enabled || !voteKey) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      if (stopped) return;
      if (typeof document !== 'undefined' && document.hidden) {
        timer = setTimeout(poll, intervalMs);
        return;
      }
      try {
        const res = await axios.get(
          `${API_ENDPOINT}/consensus/validator/live`,
          {
            // The first request asks from slot 0: the API then returns
            // its maximum, the newest 256 rows (no sinceSlot: only 150),
            // so the strip starts full.
            params: { voteKey, sinceSlot: since.current ?? 0 },
            timeout: 8000
          }
        );
        noteApiSuccess();
        if (stopped) return;
        const data = validatorLiveSchema.parse(res.data);
        const { slots: fresh, ...rest } = data;
        setMeta({ ...rest, receivedAt: Date.now() });
        // More than 256 rows since the last poll (a full response that
        // doesn't start at sinceSlot + 1): start over. A row can arrive a
        // poll late, so a short response missing its first slot is not a
        // gap - rows are keyed by slot and refill on the next poll.
        const gap =
          since.current != null &&
          fresh.length >= 256 &&
          fresh[0].slot > since.current + 1;
        setSlots(prev => {
          const bySlot = new Map((gap ? [] : prev).map(s => [s.slot, s]));
          for (const s of fresh) bySlot.set(s.slot, s);
          return [...bySlot.values()]
            .sort((a, b) => a.slot - b.slot)
            .slice(-LIVE_SLOTS);
        });
        if (data.finalThroughSlot != null)
          since.current = data.finalThroughSlot;
        setStatus('ok');
      } catch (e) {
        noteApiFailure(e);
        if (stopped) return;
        const code = axios.isAxiosError(e) ? e.response?.status : undefined;
        if (code === 404 && since.current == null) {
          setStatus('notAdmitted');
          return; // not in this epoch's rank map: nothing to poll for
        }
        if (since.current == null) setStatus('unavailable');
      }
      timer = setTimeout(poll, intervalMs);
    };
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [voteKey, enabled, intervalMs]);

  return { slots, meta, status };
};

export default useValidatorLive;
