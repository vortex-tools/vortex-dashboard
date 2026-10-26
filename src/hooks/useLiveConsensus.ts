import { API_ENDPOINT } from 'helpers/apiEndpoint';
import useLiveRefresh from 'hooks/useLiveRefresh';
import { LiveConsensus, liveConsensusSchema } from 'providers/vortex-schemas';
import { useCallback, useEffect, useState } from 'react';

const FAST_MS = 2_000;
// Not connected (available:false) or not served: check back now and then.
const SLOW_MS = 30_000;

/**
 * The live vote pool (/consensus/live), polled every 2 s while it's
 * available, every 30 s while it isn't. null until the first answer, or
 * on APIs without the endpoint.
 */
const useLiveConsensus = (limit = 32): LiveConsensus | null => {
  const [live, setLive] = useState<LiveConsensus | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_ENDPOINT}/consensus/live?limit=${limit}`);
      if (!res.ok) return;
      setLive(liveConsensusSchema.parse(await res.json()));
    } catch {
      // keep what we had; the next poll tries again
    }
  }, [limit]);
  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(true, live?.available ? FAST_MS : SLOW_MS, load);
  return live;
};

export default useLiveConsensus;
