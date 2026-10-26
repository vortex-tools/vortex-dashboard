import DelayedSpinner from 'components/common/DelayedSpinner';
import SectionCard from 'components/common/SectionCard';
import StakeRace, { RaceFrame } from 'components/common/StakeRace';
import { raceEntries } from 'components/charts/e-charts/StakeRaceChart';
import { GeoBreakdown } from 'providers/vortex-schemas';
import UntrackedState from 'components/common/UntrackedState';
import { useApiHealth } from 'helpers/apiHealth';
import {
  CLUSTER_KEY,
  VALIDATOR_STATUS_SUMMARY_KEY,
  VortexDataContext
} from 'providers/VortexDataProvider';
import { ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { ButtonGroup, Col, Row, ToggleButton } from 'react-bootstrap';
import { Link } from 'react-router';

/** History the Past views load: recent epochs first (on the first
 *  Past click), everything on request. */
const HISTORY_SHALLOW = 50;
const HISTORY_FULL = 600;

/** The page's shared history loading, for the cards' Recent / History
 *  views: recent epochs, or all of them, each on first ask. */
type HistoryCtl = {
  loadRecent: () => void;
  loadFull: () => void;
  /** The full history is in (else only the recent epochs, if any). */
  full: boolean;
  loading: boolean;
  failed: boolean;
};
/** Rows per breakdown card before "Show all". */
const FIRST_ROWS = 8;

type Group = {
  key: string;
  label: ReactNode;
  /** For the title attribute (plain text). */
  title?: string;
  validators: number;
  stake: number;
};

type Concentration = {
  entities: number;
  /** Fewest groups together over 1/3 of the stake: could halt consensus. */
  superminority: number;
  top1Share: number;
};

/** Concentration of stake over groups (largest first), of `total`. */
const concentration = (groups: Group[], total: number): Concentration => {
  const sorted = [...groups].sort((a, b) => b.stake - a.stake);
  let sum = 0;
  let superminority = 0;
  for (const g of sorted) {
    if (sum > total / 3) break;
    sum += g.stake;
    superminority++;
  }
  return {
    entities: sorted.filter(g => g.stake > 0).length,
    superminority,
    top1Share: total ? (sorted[0]?.stake ?? 0) / total : 0
  };
};

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();
const countryName = (cc: string) => {
  try {
    return regionNames?.of(cc) ?? cc;
  } catch {
    return cc;
  }
};
/** "DE" -> the flag emoji. */
const flag = (cc: string) =>
  /^[A-Z]{2}$/.test(cc)
    ? String.fromCodePoint(...[...cc].map(c => 0x1f1e6 + c.charCodeAt(0) - 65))
    : '';

/** "AgaveBam" -> "Agave · BAM". */
const CLIENT_LABELS: Record<string, string> = {
  AgaveBam: 'Agave · BAM',
  JitoLabs: 'Agave · Jito',
  HarmonicAgave: 'Agave · Harmonic',
  HarmonicFiredancer: 'Firedancer · Harmonic',
  FireBAM: 'Firedancer · BAM',
  Firedancer: 'Firedancer',
  Frankendancer: 'Frankendancer',
  Agave: 'Agave',
  Rakurai: 'Agave · Rakurai',
  Raiku: 'Agave · Raiku'
};
const FAMILY_LABELS: Record<string, string> = {
  solanaLabs: 'Solana Labs',
  unknown: 'Unknown',
  agave: 'Agave',
  firedancer: 'Firedancer',
  frankendancer: 'Frankendancer',
  mithril: 'Mithril',
  sig: 'Sig'
};
/** The flavor's name within its family: "AgaveBam" -> "BAM". */
/** A client id's block-building flavor, across families: "AgaveBam" and
 *  "FireBAM" are both BAM. null: the plain client (no flavor). */
const FLAVORS: Record<string, string | null> = {
  AgaveBam: 'BAM',
  FireBAM: 'BAM',
  JitoLabs: 'Jito',
  HarmonicAgave: 'Harmonic',
  HarmonicFiredancer: 'Harmonic',
  Rakurai: 'Rakurai',
  Raiku: 'Raiku',
  Paladin: 'Paladin',
  AgavePaladin: 'Paladin',
  Agave: null,
  Firedancer: null,
  Frankendancer: null
};

/** geo-history's flavor keys, as the card names them. */
const FLAVOR_KEYS: Record<string, string> = {
  bam: 'BAM',
  harmonic: 'Harmonic',
  jito: 'Jito',
  rakurai: 'Rakurai',
  raiku: 'Raiku',
  paladin: 'Paladin',
  plain: 'Plain client'
};

const flavorOf = (clientId: string | null) =>
  clientId && CLIENT_LABELS[clientId]
    ? (CLIENT_LABELS[clientId].split(' · ')[1] ?? null)
    : null;

const plural = (noun: string) =>
  noun === 'provider + city'
    ? 'provider + city pairs'
    : noun.endsWith('y')
      ? `${noun.slice(0, -1)}ies`
      : `${noun}s`;

/** "UAB Cherry Servers" -> "Cherry Servers", "TeraSwitch Networks Inc."
 *  -> "TeraSwitch": a provider's name short enough for a label. */
const shortOrg = (org: string) =>
  org
    .replace(/^UAB\s+/, '')
    .replace(
      /[,\s]+(Inc\.?|LLC|Ltd\.?|LTDA|SAS|SA|GmbH|B\.V\.|BV|Networks|Corporation|Corp\.?|Limited|Co\.?)\b\.?/gi,
      ''
    )
    .trim() || org;

/** "395201-DE-Frankfurt am Main" -> "🇩🇪 Frankfurt am Main · Allnodes":
 *  a provider in a city (DB-IP's ASN-country-city), not a building. */
const providerCity = (
  key: string,
  orgOf: Map<number, string | null>,
  shortCity = false
) => {
  const [asn, cc, ...rest] = key.split('-');
  const org = shortOrg(orgOf.get(Number(asn)) ?? `AS${asn}`);
  const city = rest.join('-');
  // "Frankfurt am Main" -> "Frankfurt", for chart labels.
  const place = shortCity
    ? city.replace(/\s+(am|an der|upon|on|in)\s.*$/i, '')
    : city;
  return `${flag(cc)} ${place} · ${org}`.trim();
};

const pct = (share: number, digits = 1) => `${(share * 100).toFixed(digits)}%`;

/** A breakdown whose data (the status summary) isn't in yet. */
const PendingCard = ({
  title,
  icon,
  failed
}: {
  title: string;
  icon: string;
  failed: boolean;
}) => (
  <SectionCard title={title} icon={icon}>
    {failed ? (
      <UntrackedState>Couldn&apos;t load validator locations.</UntrackedState>
    ) : (
      <DelayedSpinner loading label="Loading validators…" />
    )}
  </SectionCard>
);

/**
 * One breakdown: its groups largest first, each a share bar - the
 * Nakamoto ones (the fewest that together could halt consensus) marked.
 */
const BreakdownCard = ({
  title,
  icon,
  info,
  groups,
  total,
  noun,
  countValidators = true,
  nakamoto = true,
  race,
  history
}: {
  /** The page's history loading (its Past toggle; omitted: Now only). */
  history?: HistoryCtl;
  /** Its Nakamoto number (badge, marked rows); off where it isn't a
   *  meaningful halt threshold (clients, flavors, continents). */
  nakamoto?: boolean;
  /** Its history, for the Race view (none: list only). */
  race?: RaceFrame[];
  /** Each row's validator count (off for the validators card). */
  countValidators?: boolean;
  title: string;
  icon: string;
  info: string;
  groups: Group[];
  total: number;
  noun: string;
}) => {
  const [all, setAll] = useState(false);
  const [view, setView] = useState<'now' | 'recent' | 'history'>('now');
  const racing = view !== 'now';
  // Recent: the last epochs of whatever is loaded; History: all of it,
  // once the full history is in.
  const frames =
    view === 'recent'
      ? race?.slice(-HISTORY_SHALLOW)
      : view === 'history' && history?.full
        ? race
        : undefined;
  const sorted = useMemo(
    () => [...groups].sort((a, b) => b.stake - a.stake),
    [groups]
  );
  const c = concentration(sorted, total);
  const shown = all ? sorted : sorted.slice(0, FIRST_ROWS);
  const max = sorted[0]?.stake ?? 0;
  return (
    <SectionCard
      title={title}
      icon={icon}
      info={info}
      badge={
        nakamoto && (
          <span
            className={`badge badge-soft ms-2 ${c.superminority <= 1 ? 'badge-soft-danger' : c.superminority <= 3 ? 'badge-soft-warning' : 'badge-soft-secondary'}`}
            title={`Nakamoto coefficient: the fewest ${plural(noun)} together holding over a third of the stake - enough to halt consensus`}
          >
            Nakamoto {c.superminority}
          </span>
        )
      }
      aside={
        history ? (
          <ButtonGroup size="sm">
            {(['now', 'recent', 'history'] as const).map(v => (
              <ToggleButton
                key={v}
                id={`${title}-view-${v}`}
                type="radio"
                name={`${title}-view`}
                variant="soft-secondary"
                value={v}
                checked={view === v}
                onChange={() => {
                  setView(v);
                  if (v === 'recent') history.loadRecent();
                  if (v === 'history') history.loadFull();
                }}
              >
                {v === 'now' ? 'Now' : v === 'recent' ? 'Recent' : 'History'}
              </ToggleButton>
            ))}
          </ButtonGroup>
        ) : undefined
      }
    >
      {racing ? (
        frames?.length ? (
          <StakeRace
            key={view}
            frames={frames}
            third={nakamoto}
            // Recent plays every epoch, quickly; History jumps.
            {...(view === 'recent' ? { step: 1, frameMs: 300 } : {})}
          />
        ) : history?.loading ? (
          <DelayedSpinner loading label="Loading history…" />
        ) : (
          <p className="fs-9 text-body-tertiary mb-0">
            {history?.failed
              ? "History isn't available right now."
              : `No history for ${plural(noun)} yet.`}
          </p>
        )
      ) : (
        <>
          <div className="d-flex flex-column gap-2 fs-9">
            {shown.map((g, i) => {
              const share = total ? g.stake / total : 0;
              const inSuper = nakamoto && i < c.superminority;
              return (
                <div key={g.key} title={g.title}>
                  <div className="d-flex align-items-baseline gap-2">
                    <span
                      className="text-body-tertiary font-monospace fs-10 text-end"
                      style={{ width: '1.5rem' }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-truncate flex-grow-1 min-w-0">
                      {g.label}
                    </span>
                    {countValidators && (
                      <span className="text-body-tertiary fs-10 text-nowrap">
                        {g.validators.toLocaleString()}{' '}
                        {g.validators === 1 ? 'validator' : 'validators'}
                      </span>
                    )}
                    <span
                      className="font-monospace fw-semibold text-end"
                      style={{ width: '3.75rem' }}
                    >
                      {pct(share)}
                    </span>
                  </div>
                  <div
                    className="rounded-pill bg-body-secondary overflow-hidden"
                    style={{ height: 4, marginLeft: '2rem' }}
                  >
                    <div
                      className={`h-100 rounded-pill${inSuper ? ' bg-warning' : ''}`}
                      style={{
                        width: `${max ? (g.stake / max) * 100 : 0}%`,
                        background: inSuper
                          ? undefined
                          : 'var(--vx-quaternary-color)'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="d-flex flex-wrap align-items-center gap-3 fs-10 text-body-tertiary mt-3">
            <span>largest {pct(c.top1Share)}</span>
            {nakamoto && (
              <span className="d-inline-flex align-items-center gap-1">
                <span
                  className="d-inline-block rounded-pill bg-warning"
                  style={{ width: 12, height: 4 }}
                />
                the{' '}
                {c.superminority === 1
                  ? noun
                  : `${c.superminority} ${plural(noun)}`}{' '}
                that could halt consensus
              </span>
            )}
            {sorted.length > FIRST_ROWS && (
              <button
                type="button"
                className="btn btn-link p-0 fs-10 ms-auto"
                onClick={() => setAll(a => !a)}
              >
                {all ? 'Show fewer' : `Show all ${sorted.length}`}
              </button>
            )}
          </div>
        </>
      )}
    </SectionCard>
  );
};

/**
 * How spread out the cluster's stake is: a card per breakdown (provider,
 * provider + city, country, continent, client, flavor, validator), the
 * halt-relevant ones with their Nakamoto number, each with a Race view
 * of how it moved epoch by epoch. /cluster/distribution (60 s snapshot)
 * for providers and clients, /validators/status/summary for countries,
 * continents and validators, /cluster/geo-history for the races.
 */
const Decentralization = () => {
  const context = useContext(VortexDataContext);
  const dist = context?.clusterDistributionState.data.get(CLUSTER_KEY);
  const summary = context?.validatorStatusSummaryState.data.get(
    VALIDATOR_STATUS_SUMMARY_KEY
  );
  // History loads on the first Past click (recent epochs), all of it on
  // request - not with the page.
  const [depth, setDepth] = useState(0);
  const historySlice = context?.clusterGeoHistoryState;
  const history =
    historySlice?.data.get(HISTORY_FULL) ??
    historySlice?.data.get(HISTORY_SHALLOW);
  const fetchDist = context?.clusterDistributionState.fetchData;
  const fetchSummary = context?.validatorStatusSummaryState.fetchData;
  const fetchHistory = context?.clusterGeoHistoryState.fetchData;
  // Past validators' names, for the Validators race's older epochs.
  const allNames = context?.validatorNamesState.data.get(CLUSTER_KEY);
  const fetchNames = context?.validatorNamesState.fetchData;
  useEffect(() => {
    fetchDist?.(CLUSTER_KEY);
    fetchSummary?.(VALIDATOR_STATUS_SUMMARY_KEY);
  }, [fetchDist, fetchSummary]);
  useEffect(() => {
    if (!depth) return;
    fetchHistory?.(depth);
    fetchNames?.(CLUSTER_KEY);
  }, [depth, fetchHistory, fetchNames]);
  const full = !!historySlice?.data.get(HISTORY_FULL);
  const historyCtl: HistoryCtl = {
    loadRecent: () => setDepth(d => d || HISTORY_SHALLOW),
    loadFull: () => setDepth(HISTORY_FULL),
    full,
    loading:
      (depth > 0 && !history) || (depth === HISTORY_FULL && !full)
        ? !historySlice?.error
        : false,
    failed:
      !!historySlice?.error && (!history || (depth === HISTORY_FULL && !full))
  };

  const view = useMemo(() => {
    if (!dist) return null;
    const total = dist.totalActivatedStake;
    // Clients by family: Agave's flavors (Jito, BAM, Harmonic, ...) are
    // one client - a bug in its code is shared by all of them. The
    // flavors are listed under each.
    const flavors = new Map<string, string[]>();
    for (const c of dist.clientIds) {
      const f = flavorOf(c.clientId);
      if (!f) continue;
      const key = c.family ?? 'none';
      flavors.set(key, [...(flavors.get(key) ?? []), f]);
    }
    // Flavors: block building across families (Harmonic on Agave and on
    // Firedancer together), each row naming the clients it includes.
    const byFlavor = new Map<string, Group & { clients: Set<string> }>();
    for (const c of dist.clientIds) {
      const known = c.clientId != null && c.clientId in FLAVORS;
      const name = known
        ? (FLAVORS[c.clientId!] ?? 'Plain client')
        : c.clientId
          ? 'Unrecognized'
          : 'Not in gossip';
      const g = byFlavor.get(name) ?? {
        key: name,
        label: name,
        validators: 0,
        stake: 0,
        clients: new Set<string>()
      };
      g.validators += c.validators;
      g.stake += c.stake;
      if (c.family) g.clients.add(FAMILY_LABELS[c.family] ?? c.family);
      byFlavor.set(name, g);
    }
    const flavorGroups: Group[] = [...byFlavor.values()].map(g => {
      const on = [...g.clients].sort();
      return {
        key: g.key,
        label: (
          <>
            {g.key}
            {on.length ? (
              <span className="text-body-tertiary"> · on {on.join(', ')}</span>
            ) : null}
          </>
        ),
        title: on.length ? `${g.key} on ${on.join(', ')}` : g.key,
        validators: g.validators,
        stake: g.stake
      };
    });
    const families: Group[] = dist.clients.map(c => {
      const key = c.family ?? 'none';
      const name = c.family
        ? (FAMILY_LABELS[c.family] ?? c.family)
        : 'Not in gossip';
      const fl = flavors.get(key);
      return {
        key,
        label: (
          <>
            {name}
            {fl?.length ? (
              <span className="text-body-tertiary">
                {' '}
                · incl. {fl.join(', ')}
              </span>
            ) : null}
          </>
        ),
        title: fl?.length ? `${name}, including ${fl.join(', ')}` : name,
        validators: c.validators,
        stake: c.stake
      };
    });
    // Providers: ASNs, merged where they name the same organization (one
    // company's several ASNs are one provider).
    const byOrg = new Map<string, Group & { asns: number[] }>();
    for (const a of dist.asns) {
      const name = a.organization ?? `AS${a.asn}`;
      const g = byOrg.get(name) ?? {
        key: name,
        label: name,
        validators: 0,
        stake: 0,
        asns: []
      };
      g.validators += a.validators;
      g.stake += a.stake;
      g.asns.push(a.asn);
      byOrg.set(name, g);
    }
    const asns: Group[] = [...byOrg.values()].map(g => ({
      ...g,
      title: g.asns.map(n => `AS${n}`).join(', ')
    }));
    // Countries: each validator's, from the status summary.
    const byCountry = new Map<string, Group>();
    for (const v of summary?.validators ?? []) {
      const cc = v.countryCode;
      if (!cc) continue;
      const g = byCountry.get(cc) ?? {
        key: cc,
        label: (
          <>
            <span className="me-1">{flag(cc)}</span>
            {v.country ?? countryName(cc)}
          </>
        ),
        title: cc,
        validators: 0,
        stake: 0
      };
      g.validators += 1;
      g.stake += v.activatedStake;
      byCountry.set(cc, g);
    }
    // Provider + city (the API's dataCenters, when it serves them).
    const orgOf = new Map(dist.asns.map(a => [a.asn, a.organization]));
    const providerCities: Group[] = (dist.dataCenters ?? []).map(d => ({
      key: d.dataCenterKey,
      label: providerCity(d.dataCenterKey, orgOf),
      title: d.dataCenterKey,
      validators: d.validators,
      stake: d.stake
    }));
    const validators: Group[] = (summary?.validators ?? []).map(v => ({
      key: v.identity,
      label: (
        <Link to={`/validator/${v.identity}`}>
          {v.name ?? `${v.identity.slice(0, 6)}…${v.identity.slice(-6)}`}
        </Link>
      ),
      validators: 1,
      stake: v.activatedStake
    }));
    // Continents: each validator's, from the status summary.
    const byContinent = new Map<string, Group>();
    for (const v of summary?.validators ?? []) {
      if (!v.continent) continue;
      const g = byContinent.get(v.continent) ?? {
        key: v.continent,
        label: v.continent,
        validators: 0,
        stake: 0
      };
      g.validators += 1;
      g.stake += v.activatedStake;
      byContinent.set(v.continent, g);
    }
    const continents = [...byContinent.values()];
    return {
      total,
      continents,
      families,
      flavors: flavorGroups,
      asns,
      countries: [...byCountry.values()],
      providerCities,
      validators,
      c: {
        families: concentration(families, total),
        asns: concentration(asns, total),
        countries: concentration([...byCountry.values()], total),
        continents: continents.length ? concentration(continents, total) : null,
        validators: validators.length ? concentration(validators, total) : null
      }
    };
  }, [dist, summary]);

  // Each breakdown's history, for its Race view (geo-history).
  const races = useMemo(() => {
    if (!history?.epochs.length) return null;
    const orgOf = new Map((dist?.asns ?? []).map(a => [a.asn, a.organization]));
    // Today's validators by their summary name, past ones (no longer
    // staked) by /validators/names.
    const nameOf = new Map<string, string | null>([
      ...Object.entries(allNames?.names ?? {}),
      ...(summary?.validators ?? [])
        .filter(v => v.name)
        .map((v): [string, string | null] => [v.identity, v.name])
    ]);
    type Epoch = (typeof history.epochs)[number];
    const frames = (
      pick: (e: Epoch) => GeoBreakdown | null | undefined,
      label: (key: string, name: string | null) => string,
      allStake = false
    ): RaceFrame[] =>
      history.epochs.map(e => ({
        epoch: e.epoch,
        entries: raceEntries(pick(e), label),
        located: allStake ? 1 : 1 - (e.unlocated?.share ?? 0),
        approximate: !allStake && !!e.approximate
      }));
    const clientFrames = (
      pick: (e: Epoch) => GeoBreakdown | null | undefined,
      label: (key: string, name: string | null) => string
    ): RaceFrame[] =>
      history.epochs.map(e => ({
        epoch: e.epoch,
        entries: raceEntries(pick(e), label),
        located: 1 - (pick(e)?.unresolved?.share ?? 0),
        covers: 'clients',
        approximate: false
      }));
    return {
      asns: frames(
        e => e.asns,
        (k, n) => n ?? `AS${k}`
      ),
      providerCities: frames(
        e => e.dataCenters,
        k => providerCity(k, orgOf, true)
      ),
      countries: frames(
        e => e.countries,
        (k, n) => `${flag(k)} ${n ?? countryName(k)}`.trim()
      ),
      continents: frames(
        e => e.continents,
        (k, n) => n ?? k
      ),
      // By client family over all the stake, once geo-history serves it.
      // Clients and flavors over all the stake; client data covers less
      // of it going back (unresolved: none recorded).
      clients: history.epochs.some(e => e.clients?.top.length)
        ? clientFrames(
            e => e.clients,
            (k, n) => FAMILY_LABELS[k] ?? n ?? k
          )
        : undefined,
      // The API's flavors where served, else client ids folded into
      // flavors as on the card.
      flavors: history.epochs.some(e => e.flavors?.top.length)
        ? clientFrames(
            e => e.flavors,
            k => FLAVOR_KEYS[k] ?? 'Unrecognized'
          )
        : history.epochs.some(e => e.clientIds?.top.length)
          ? clientFrames(
              e => e.clientIds,
              k =>
                k in FLAVORS ? (FLAVORS[k] ?? 'Plain client') : 'Unrecognized'
            )
          : undefined,
      // By node identity over all the stake (located or not).
      identities: frames(
        e => e.identities,
        k => nameOf.get(k) ?? `${k.slice(0, 6)}…${k.slice(-6)}`,
        true
      )
    };
  }, [history, dist, summary, allNames]);

  const error = context?.clusterDistributionState.error;
  const apiDown = useApiHealth().down;
  // Validators, Countries and Continents come from the status summary,
  // which can be missing while the distribution is in.
  const summaryFailed =
    !summary && !!context?.validatorStatusSummaryState.error && !apiDown;

  return (
    <div className="mb-9">
      <div className="page-header row g-3 align-items-start justify-content-between">
        <div className="col-auto">
          <h3>Decentralization</h3>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">
            How spread out the cluster&apos;s stake is
          </p>
        </div>
      </div>

      {!view ? (
        error && !apiDown ? (
          <UntrackedState>
            Couldn&apos;t load the stake distribution.
          </UntrackedState>
        ) : (
          <DelayedSpinner
            loading
            label={
              apiDown
                ? 'Waiting for the API…'
                : 'Loading the stake distribution…'
            }
          />
        )
      ) : (
        <div className="d-flex flex-column gap-3">
          <Row className="g-3">
            <Col xs={12} lg={6}>
              {!summary ? (
                <PendingCard
                  title="Validators"
                  icon="users"
                  failed={summaryFailed}
                />
              ) : (
                <BreakdownCard
                  title="Validators"
                  icon="users"
                  noun="validator"
                  info="Stake by validator. Operators running several validators count once per validator."
                  groups={view.validators}
                  total={view.total}
                  countValidators={false}
                  race={races?.identities}
                  history={historyCtl}
                />
              )}
            </Col>
            <Col xs={12} lg={6}>
              <BreakdownCard
                title="Providers"
                icon="server"
                noun="provider"
                info="Stake by the network (ASN) hosting each validator, an organization's ASNs together."
                groups={view.asns}
                total={view.total}
                race={races?.asns}
                history={historyCtl}
              />
            </Col>
            {view.providerCities.length > 0 && (
              <Col xs={12} lg={6}>
                <BreakdownCard
                  title="Provider + City"
                  icon="map-pin"
                  noun="provider + city"
                  info="Stake by provider (ASN) in each city (DB-IP): a provider's presence in a city, not a building - one building can hold several providers, and one provider several buildings."
                  groups={view.providerCities}
                  total={view.total}
                  race={races?.providerCities}
                  history={historyCtl}
                />
              </Col>
            )}
            <Col xs={12} lg={6}>
              {!summary ? (
                <PendingCard
                  title="Countries"
                  icon="globe"
                  failed={summaryFailed}
                />
              ) : (
                <BreakdownCard
                  title="Countries"
                  icon="globe"
                  noun="country"
                  info="Stake by the country each validator's gossip address is in (DB-IP)."
                  groups={view.countries}
                  total={view.total}
                  race={races?.countries}
                  history={historyCtl}
                />
              )}
            </Col>
            {(!summary || view.continents.length > 0) && (
              <Col xs={12} lg={6}>
                {!summary ? (
                  <PendingCard
                    title="Continents"
                    icon="map"
                    failed={summaryFailed}
                  />
                ) : (
                  <BreakdownCard
                    title="Continents"
                    icon="map"
                    noun="continent"
                    info="Stake by the continent each validator's gossip address is in (DB-IP): the long tail of countries, rolled up."
                    groups={view.continents}
                    total={view.total}
                    race={races?.continents}
                    history={historyCtl}
                    nakamoto={false}
                  />
                )}
              </Col>
            )}
            <Col xs={12} lg={6}>
              <BreakdownCard
                title="Clients"
                icon="cpu"
                noun="client"
                info="Stake by validator client, from gossip. Agave's flavors (Jito, BAM, Harmonic, Rakurai, ...) count as Agave: a bug in its code is shared by all of them. Frankendancer is Firedancer's networking on Agave's runtime."
                groups={view.families}
                total={view.total}
                race={races?.clients}
                history={historyCtl}
                nakamoto={false}
              />
            </Col>
            <Col xs={12} lg={6}>
              <BreakdownCard
                title="Flavors"
                icon="layers"
                noun="flavor"
                info="Stake by block-building flavor, across clients: Harmonic, BAM and Jito run on Agave and on Firedancer alike, so an outage in one flavor's block engine hits validators of either client. Plain client: neither."
                groups={view.flavors}
                total={view.total}
                race={races?.flavors}
                history={historyCtl}
                nakamoto={false}
              />
            </Col>
          </Row>
        </div>
      )}
    </div>
  );
};

export default Decentralization;
