import Badge, { BadgeBg } from 'components/base/Badge';

/** A pool's page (its name, as the labels give it). */
export const poolPath = (name: string) => `/pool/${encodeURIComponent(name)}`;

/** How a staker's SOL is held: an LST (a stake pool: you hold its liquid
 *  staking token - Marinade's mSOL too), native (your own stake accounts,
 *  the provider holding only their stake authority - Marinade Native's
 *  Max Yield and Select), or a foundation's own stake (SFDP). */
const KIND_STYLE: Record<
  string,
  { label: string; bg: BadgeBg; title: string }
> = {
  pool: {
    label: 'LST',
    bg: 'primary',
    title: "Liquid staking token: you hold the pool's token as your share"
  },
  direct: {
    label: 'Native',
    bg: 'info',
    title:
      'Native staking: you keep your own stake accounts; the provider holds only their stake authority and picks the validators'
  },
  program: {
    label: 'Foundation',
    bg: 'secondary',
    title: "A foundation's own stake, delegated to validators that qualify"
  }
};
export const kindOf = (kind: string | null, name?: string) =>
  kind === 'sfdp'
    ? KIND_STYLE.program
    : kind === 'marinade'
      ? /msol/i.test(name ?? '')
        ? KIND_STYLE.pool
        : KIND_STYLE.direct
      : kind === 'stake-pool' || kind === 'lido'
        ? KIND_STYLE.pool
        : null;
/** The labels, for text that lists them. */
export const KIND = KIND_STYLE;

export const KindBadge = ({
  kind,
  name
}: {
  kind: string | null;
  name?: string;
}) => {
  const k = kindOf(kind, name);
  return k ? (
    <Badge bg={k.bg} className="text-nowrap" title={k.title}>
      {k.label}
    </Badge>
  ) : null;
};

/** Who can get into a pool: open (published criteria anyone meeting
 *  them gets) or gated (someone admits you). Names are provisional. */
const ADMISSION: Record<string, { label: string; bg: BadgeBg }> = {
  open: { label: 'Open', bg: 'success' },
  gated: { label: 'Gated', bg: 'warning' }
};
const REASON: Record<string, string> = {
  criteria: 'published criteria',
  network: 'joining a network',
  application: 'by application',
  invite: 'by invite',
  board: 'by board vote'
};
export interface Admission {
  kind: string;
  reason: string | null;
  sourceUrl: string | null;
  note: string | null;
}
/** "Open: published criteria" / "Gated: by application", and the note. */
export const admissionText = (a: Admission) =>
  [
    `${ADMISSION[a.kind]?.label ?? a.kind}${
      a.reason ? `: ${REASON[a.reason] ?? a.reason}` : ''
    }`,
    a.note
  ]
    .filter(Boolean)
    .join('. ');

export const AdmissionBadge = ({
  admission
}: {
  admission: Admission | null | undefined;
}) => {
  const k = admission ? ADMISSION[admission.kind] : null;
  return admission && k ? (
    <Badge bg={k.bg} className="text-nowrap" title={admissionText(admission)}>
      {k.label}
    </Badge>
  ) : null;
};

/** "◎1.23M", "◎45.6K", "◎789". */
export const compactSol = (lamports: number) => {
  const sol = lamports / 1e9;
  const abs = Math.abs(sol);
  return abs >= 1e6
    ? `◎${(sol / 1e6).toFixed(2)}M`
    : abs >= 1e3
      ? `◎${(sol / 1e3).toFixed(1)}K`
      : `◎${Math.round(sol).toLocaleString()}`;
};

/** A signed change, "+◎12.3K" / "−◎4.0K", or null when none. */
export const signedSol = (lamports: number) =>
  Math.abs(lamports) < 1e9
    ? null
    : `${lamports > 0 ? '+' : '−'}${compactSol(Math.abs(lamports))}`;

export const pct = (x: number | null | undefined, digits = 1) =>
  x == null ? '—' : `${(x * 100).toFixed(digits)}%`;

/** A value's change since the previous epoch, colored. `below`: on its
 *  own small line under the value (in right-aligned table cells, where an
 *  inline change would push the values out of line). */
export const Delta = ({
  now,
  prev,
  format,
  below = false
}: {
  now: number;
  prev: number | null | undefined;
  format: (d: number) => string | null;
  below?: boolean;
}) => {
  const d = prev == null ? 0 : now - prev;
  const text = prev == null || d === 0 ? null : format(d);
  if (!text) return null;
  return (
    <span
      className={`fs-10 ${below ? 'd-block lh-1' : 'ms-1'} ${d > 0 ? 'text-success' : 'text-danger'}`}
    >
      {text}
    </span>
  );
};

export const signedCount = (d: number) =>
  d === 0 ? null : `${d > 0 ? '+' : '−'}${Math.abs(d).toLocaleString()}`;

/** "5%", "0.1%" from basis points. */
export const bpsPct = (bps: number | null | undefined) =>
  bps == null
    ? '—'
    : `${(bps / 100).toFixed(bps % 100 ? (bps % 10 ? 2 : 1) : 0)}%`;
