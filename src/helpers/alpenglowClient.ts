/**
 * Which clients can take part in mainnet's Alpenglow migration - no
 * imports, so the share Worker (worker/) uses the same rules as the app.
 * Context and sources: helpers/alpenglowMigration.ts.
 */

export const MAINNET_ACTIVATION_EPOCH = 1064;

/** Agave 4.2.x declares a different `alpenglow` feature id
 *  (a1penGLz…), so it never sees mainnet's activation: 4.3 or newer. */
export const MIN_AGAVE = [4, 3] as const;

/** 'switch': must move to Agave before the migration. 'upgrade': Agave
 *  older than 4.3. 'unsupported': the client can't run Alpenglow. */
export type ClientVerdict = 'ok' | 'switch' | 'upgrade' | 'unsupported';

/** Agave (and its forks, which report family agave) older than 4.3. */
export const oldAgave = (version: string | null | undefined) => {
  const m = version?.match(/^(\d+)\.(\d+)/);
  if (!m) return false;
  const [maj, min] = [Number(m[1]), Number(m[2])];
  return maj < MIN_AGAVE[0] || (maj === MIN_AGAVE[0] && min < MIN_AGAVE[1]);
};

/** What a client (status/summary `software`) means for the migration:
 *  before it (`migrated` false) only Agave 4.3+ is fine. */
export const clientVerdict = (
  family: string | null | undefined,
  migrated: boolean,
  version?: string | null
): ClientVerdict => {
  const f = family?.toLowerCase();
  if (f === 'frankendancer') return migrated ? 'unsupported' : 'switch';
  if (f === 'firedancer') return migrated ? 'ok' : 'switch';
  if (f === 'agave' && oldAgave(version)) return 'upgrade';
  return 'ok';
};

/**
 * A validator's Alpenglow readiness, from /validators/status: a client
 * that takes part, a BLS key, and its admission tickets (the API's vat
 * check: before the migration 'warn' = the first ticket isn't funded;
 * after it, a short runway on an admitted validator). The share card
 * (worker/) and the app's Share button use this one rule.
 */
export const alpenglowReadiness = (s: {
  family: string | null | undefined;
  version: string | null | undefined;
  migrated: boolean;
  blsPubkeySet: boolean | null | undefined;
  vatCheck: string | null | undefined;
}) => {
  const verdict = clientVerdict(s.family, s.migrated, s.version);
  const client = verdict === 'ok';
  const bls = !!s.blsPubkeySet;
  const funded = s.vatCheck === 'ok' || (s.migrated && s.vatCheck === 'warn');
  return { verdict, client, bls, funded, ready: client && bls && funded };
};

/** The fields of /validators/status the readiness view reads. */
export interface ReadinessStatus {
  identity: string;
  info?: { name?: string | null; iconUrl?: string | null } | null;
  software?: { family?: string | null; version?: string | null } | null;
  vat?: {
    blsPubkeySet?: boolean | null;
    epochsFunded?: number | null;
  } | null;
  cluster?: { alpenglowActive?: boolean | null } | null;
  stake?: { shareOfTotal?: number | null } | null;
  checks?: Array<{ id: string; status: string }>;
}

/** 0.00047 -> "0.047% of stake" (small shares keep 3 significant digits). */
export const formatStakeShareOf = (share: number | null | undefined) =>
  share == null
    ? null
    : `${(share * 100).toFixed(share >= 0.01 ? 2 : 3)}% of stake`;

/**
 * What the share card and the share page say about a validator: its name,
 * whether it's ready (or running Alpenglow already), and the three checks
 * with a short hint each.
 */
export const readinessView = (s: ReadinessStatus) => {
  const migrated = !!s.cluster?.alpenglowActive;
  const { verdict, client, bls, funded, ready } = alpenglowReadiness({
    family: s.software?.family,
    version: s.software?.version,
    migrated,
    blsPubkeySet: s.vat?.blsPubkeySet,
    vatCheck: s.checks?.find(c => c.id === 'vat')?.status
  });
  const family = s.software?.family
    ? s.software.family.charAt(0).toUpperCase() + s.software.family.slice(1)
    : 'Unknown client';
  return {
    name:
      s.info?.name?.trim() ||
      `${s.identity.slice(0, 4)}…${s.identity.slice(-4)}`,
    migrated,
    ready,
    stake: formatStakeShareOf(s.stake?.shareOfTotal),
    rows: [
      {
        ok: client,
        text: `${family}${s.software?.version ? ` ${s.software.version}` : ''}`,
        hint: client
          ? 'runs Alpenglow'
          : verdict === 'upgrade'
            ? 'upgrade to Agave 4.3+'
            : verdict === 'switch'
              ? 'switch to Agave for the migration'
              : 'unsupported client'
      },
      {
        ok: bls,
        text: 'BLS key',
        hint: bls ? 'registered' : 'not registered'
      },
      {
        ok: funded,
        text: 'Admission tickets',
        hint:
          s.vat?.epochsFunded != null && s.vat.epochsFunded > 0
            ? `${s.vat.epochsFunded} epochs funded`
            : 'not funded'
      }
    ]
  };
};
export type ReadinessView = ReturnType<typeof readinessView>;

/** The share link (the Worker's card page) and an X post prefilled with it. */
export const shareLink = (origin: string, identity: string) =>
  `${origin}/share/alpenglow/${identity}`;
/** X's post composer with the share link - versioned (verdict + epoch) so
 *  a re-share after a change isn't served X's week-old cached card. */
export const shareIntent = (
  origin: string,
  identity: string,
  v: ReadinessView,
  epoch: number
) =>
  `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    v.migrated
      ? `${v.name} is running Alpenglow. Is your validator?`
      : `${v.name} is all go for Alpenglow ✅ Is your validator ready?`
  )}&url=${encodeURIComponent(
    `${shareLink(origin, identity)}?v=${cardVersion(v, epoch)}`
  )}`;
/** The card's design version: bump it when the card's look changes, so
 *  cached images (Cloudflare's, X's) aren't served for new shares. */
const CARD_DESIGN = 2;
/** The card image, versioned by design + verdict + epoch (past X's image
 *  cache). */
export const cardVersion = (v: ReadinessView, epoch: number) =>
  `${CARD_DESIGN}.${v.ready ? 1 : 0}${v.rows.map(x => +x.ok).join('')}-${epoch}`;
