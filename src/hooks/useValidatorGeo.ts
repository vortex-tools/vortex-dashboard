import { API_ENDPOINT } from 'helpers/apiEndpoint';
import { ValidatorGeo, validatorGeoSchema } from 'providers/vortex-schemas';
import { useEffect, useState } from 'react';

type GeoSet = {
  byNode: Map<string, ValidatorGeo>;
  /** 'epoch': where each validator was that epoch; 'current': today. */
  source: 'epoch' | 'current';
  edition: string | null;
};

// One request per epoch (or "now") per session - it changes slowly.
const cache = new Map<string, Promise<GeoSet>>();
const load = (epoch: number | null) => {
  const key = epoch == null ? 'now' : String(epoch);
  let p = cache.get(key);
  if (!p) {
    p = fetch(
      `${API_ENDPOINT}/validators/geo${epoch == null ? '' : `?epoch=${epoch}`}`
    )
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(j => {
        const parsed = validatorGeoSchema.parse(j);
        return {
          byNode: new Map(parsed.validators.map(x => [x.nodeAddress, x])),
          // Older APIs ignore ?epoch and say nothing: today's geography.
          source:
            epoch != null && parsed.geography?.source === 'epoch'
              ? ('epoch' as const)
              : ('current' as const),
          edition: parsed.geography?.edition ?? null
        };
      });
    p.catch(() => cache.delete(key)); // let a later mount retry
    cache.set(key, p);
  }
  return p;
};

/**
 * Validator locations (/validators/geo), keyed by node address: today's,
 * or - given an epoch - where each was that epoch when the API has it
 * recorded (`source` says which it got). null until loaded, or if the API
 * doesn't serve it.
 */
export const useValidatorGeoAt = (
  epoch: number | null,
  /** Off: no request (a caller that already has its locations). */
  enabled = true
): GeoSet | null => {
  const [set, setSet] = useState<GeoSet | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setSet(null);
    load(epoch).then(
      s => alive && setSet(s),
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, [epoch, enabled]);
  return set;
};

/** Today's locations, by node address (the live views). */
const useValidatorGeo = (enabled = true): Map<string, ValidatorGeo> | null =>
  useValidatorGeoAt(null, enabled)?.byNode ?? null;

/** "Salt Lake City, US" - or the country, or null. */
export const placeOf = (g: ValidatorGeo | undefined) => {
  const c = g?.geo;
  if (!c) return null;
  return [c.city, c.countryCode].filter(Boolean).join(', ') || null;
};

/** How to label a location's date: "as of epoch N" or "as of now". */
export const geoAsOf = (
  set: { source: 'epoch' | 'current' } | null,
  epoch: number | null
) =>
  set?.source === 'epoch' && epoch != null
    ? `as of epoch ${epoch}`
    : 'as of now';

export default useValidatorGeo;
