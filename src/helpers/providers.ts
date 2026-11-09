import { ValidatorGeo } from 'providers/vortex-schemas';

/** A hosting provider's validators in one place (DB-IP's city). */
export type ProviderLocation = {
  /** `CC-City`, unique within the provider. */
  key: string;
  city: string | null;
  countryCode: string | null;
  country: string | null;
  continent: string | null;
  coord: [number, number] | null;
  validators: ValidatorGeo[];
  stake: number;
};

/** A hosting provider: the network (ASN owner, as DB-IP names it) its
 *  validators' gossip addresses sit in - all its ASNs together. */
export type Provider = {
  slug: string;
  name: string;
  asns: number[];
  validators: ValidatorGeo[];
  stake: number;
  /** Share of all staked validators' stake (located or not). */
  share: number;
  /** Its places, most stake first. */
  locations: ProviderLocation[];
  countries: number;
};

/** A URL-safe key from the network's name: "UAB Cherry Servers" ->
 *  "uab-cherry-servers". */
export const providerSlug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';

export const providerPath = (p: { slug: string }) => `/provider/${p.slug}`;

const placeKey = (g: NonNullable<ValidatorGeo['geo']>) =>
  `${g.countryCode ?? ''}-${g.city ?? ''}`;

/**
 * Every hosting provider from the validator locations (/validators/geo),
 * most stake first, with the stake its validators couldn't be placed
 * with (no gossip address, or none DB-IP could resolve to a network).
 */
export const groupProviders = (all: ValidatorGeo[]) => {
  const total = all.reduce((a, v) => a + v.activatedStake, 0);
  const by = new Map<string, Provider>();
  const unlocated: ValidatorGeo[] = [];
  for (const v of all) {
    const g = v.geo;
    if (!g?.asn) {
      unlocated.push(v);
      continue;
    }
    const name = g.asnOrganization?.trim() || `AS${g.asn}`;
    const slug = providerSlug(name);
    let p = by.get(slug);
    if (!p) {
      p = {
        slug,
        name,
        asns: [],
        validators: [],
        stake: 0,
        share: 0,
        locations: [],
        countries: 0
      };
      by.set(slug, p);
    }
    if (!p.asns.includes(g.asn)) p.asns.push(g.asn);
    p.validators.push(v);
    p.stake += v.activatedStake;
    const key = placeKey(g);
    let l = p.locations.find(x => x.key === key);
    if (!l) {
      l = {
        key,
        city: g.city,
        countryCode: g.countryCode,
        country: g.country ?? null,
        continent: g.continent ?? null,
        coord:
          g.longitude != null && g.latitude != null
            ? [g.longitude, g.latitude]
            : null,
        validators: [],
        stake: 0
      };
      p.locations.push(l);
    }
    l.validators.push(v);
    l.stake += v.activatedStake;
  }
  const providers = [...by.values()]
    .map(p => ({
      ...p,
      share: total ? p.stake / total : 0,
      asns: p.asns.sort((a, b) => a - b),
      locations: p.locations.sort((a, b) => b.stake - a.stake),
      validators: p.validators.sort(
        (a, b) => b.activatedStake - a.activatedStake
      ),
      countries: new Set(p.locations.map(l => l.countryCode)).size
    }))
    .sort((a, b) => b.stake - a.stake);
  const unlocatedStake = unlocated.reduce((a, v) => a + v.activatedStake, 0);
  return {
    providers,
    total,
    unlocated: {
      validators: unlocated.length,
      stake: unlocatedStake,
      share: total ? unlocatedStake / total : 0
    }
  };
};

/** "Frankfurt, DE", or the country, or "Unknown place". */
export const placeName = (l: ProviderLocation) =>
  [l.city && l.city !== 'Unknown' ? l.city : null, l.countryCode]
    .filter(Boolean)
    .join(', ') || 'Unknown place';
