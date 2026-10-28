import Badge, { BadgeBg } from 'components/base/Badge';

/** A pool's page (its name, as the labels give it). */
export const poolPath = (name: string) => `/pool/${encodeURIComponent(name)}`;

/** What a staker is: a stake pool (an LST), Marinade, or SFDP. */
export const KIND: Record<string, { label: string; bg: BadgeBg }> = {
  'stake-pool': { label: 'Stake pool', bg: 'primary' },
  marinade: { label: 'Marinade', bg: 'info' },
  sfdp: { label: 'SFDP', bg: 'success' }
};

export const KindBadge = ({ kind }: { kind: string | null }) =>
  kind && KIND[kind] ? (
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

/** A value's change since the previous epoch, colored. With `width`, a
 *  fixed-width slot that's always there (empty when there's no change),
 *  so right-aligned values in a column line up whatever follows them. */
export const Delta = ({
  now,
  prev,
  format,
  width
}: {
  now: number;
  prev: number | null | undefined;
  format: (d: number) => string | null;
  width?: string;
}) => {
  const d = prev == null ? 0 : now - prev;
  const text = prev == null || d === 0 ? null : format(d);
  if (!text && !width) return null;
  return (
    <span
      className={`fs-10 ms-1 ${d > 0 ? 'text-success' : 'text-danger'}`}
      style={
        width
          ? { display: 'inline-block', minWidth: width, textAlign: 'left' }
          : undefined
      }
    >
      {text}
    </span>
  );
};

export const signedCount = (d: number) =>
  d === 0 ? null : `${d > 0 ? '+' : '−'}${Math.abs(d).toLocaleString()}`;
