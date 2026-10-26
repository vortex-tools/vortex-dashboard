/** The system's color scheme. */
export const getSystemTheme = (): 'light' | 'dark' =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

/** A theme color by name, from its `--vx-<name>` CSS variable (for
 *  charts, which need literal colors). */
export const getColor = (name: string) =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(`--vx-${name}`)
    .trim();

/** A span of seconds for people: "45s", "12 min", "3 h 5 min". */
export const formatDuration = (secs: number) => {
  if (secs < 90) return `${Math.round(secs)}s`;
  const m = Math.round(secs / 60);
  return m < 90 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

/** "block-income" -> "Block income". */
export const capitalize = (s: string) =>
  (s.charAt(0).toUpperCase() + s.slice(1)).replace(/-/g, ' ');

export const latencyToCredits = (latency: number) => {
  return latency > 0 ? Math.max(16 - Math.max(latency, 2) + 2, 1) : 0;
};

// Epochs with known incomplete block data pending a backend fix.
// (Both vote and income stats are affected since they're derived from blocks.)
const EPOCHS_WITH_MISSING_BLOCK_DATA = new Set<number>([]);
export const hasMissingBlockData = (epoch: number | undefined): boolean =>
  epoch !== undefined && EPOCHS_WITH_MISSING_BLOCK_DATA.has(epoch);

const SOL_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 9,
  maximumFractionDigits: 9
});

const SOL_FORMATTER_CACHE = new Map<number, Intl.NumberFormat>();
const solFormatter = (digits: number): Intl.NumberFormat => {
  let fmt = SOL_FORMATTER_CACHE.get(digits);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
    SOL_FORMATTER_CACHE.set(digits, fmt);
  }
  return fmt;
};

export const formatLamports = (lamports: number, digits?: number): string => {
  let sol = lamports / 1_000_000_000.0;
  const fmt = digits === undefined ? SOL_FORMATTER : solFormatter(digits);
  return `◎${fmt.format(sol)}`;
};

/** A validator's share of total stake for a table cell: "2.31%"; any
 *  non-zero share below 0.01% shows as "0.01%" (no "<", so the column's
 *  digits stay aligned). */
export const formatStakeShare = (stake: number, total: number) => {
  if (!(total > 0)) return null;
  const p = (stake / total) * 100;
  return p > 0 && p < 0.01 ? '0.01%' : `${p.toFixed(2)}%`;
};

/** The city in DB-IP's ASN-country-city key ("395201-DE-Frankfurt am
 *  Main" -> "Frankfurt am Main"): with the provider, a provider's presence
 *  in a city - not a building. */
export const cityOfKey = (key: string | null | undefined) =>
  key ? key.split('-').slice(2).join('-') || null : null;
