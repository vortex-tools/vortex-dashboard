import Badge, { BadgeBg } from 'components/base/Badge';

/** A pool's page (its name, as the labels give it). */
export const poolPath = (name: string) => `/pool/${encodeURIComponent(name)}`;

/** What a staker is: a stake pool (an LST), Marinade, or SFDP. */
export const KIND: Record<string, { label: string; bg: BadgeBg }> = {
  'stake-pool': { label: 'Stake pool', bg: 'primary' },
  marinade: { label: 'Marinade', bg: 'info' },
  sfdp: { label: 'SFDP', bg: 'success' }
};

/** A staker's kind as a badge - not where the name already says it
 *  (SFDP, "Marinade (mSOL)" / "Marinade Native" / ...). */
export const KindBadge = ({
  kind,
  name
}: {
  kind: string | null;
  name?: string;
}) =>
  kind &&
  KIND[kind] &&
  !name?.toLowerCase().startsWith(KIND[kind].label.toLowerCase()) ? (
    <Badge bg={KIND[kind].bg} className="text-nowrap">
      {KIND[kind].label}
    </Badge>
  ) : null;

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
