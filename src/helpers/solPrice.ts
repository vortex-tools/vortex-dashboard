/**
 * SOL prices for showing earnings in fiat: CoinGecko's daily SOL price
 * history (plus its latest point, i.e. "now") in the chosen currency.
 * Fetched in the browser (CoinGecko allows CORS) once per currency per
 * session. Their free API asks for attribution - see ValidatorEarnings.
 */
export type Currency = 'sol' | 'usd' | 'eur' | 'gbp' | 'jpy';

export const CURRENCIES: Array<{ id: Currency; label: string }> = [
  { id: 'sol', label: 'SOL' },
  { id: 'usd', label: 'USD' },
  { id: 'eur', label: 'EUR' },
  { id: 'gbp', label: 'GBP' },
  { id: 'jpy', label: 'JPY' }
];

/** [unix ms, price] ascending; the last point is the current price. */
export type PricePoints = Array<[number, number]>;

// Enough history for the earnings window (30 epochs of ~32 h ≈ 40 days).
const HISTORY_DAYS = 60;

const cache = new Map<Currency, Promise<PricePoints>>();

export const fetchSolPrices = (currency: Currency): Promise<PricePoints> => {
  let p = cache.get(currency);
  if (!p) {
    p = fetch(
      `https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=${currency}&days=${HISTORY_DAYS}&interval=daily`
    )
      .then(res => {
        if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
        return res.json();
      })
      .then((d: { prices?: PricePoints }) => {
        const points = (d.prices ?? []).filter(
          x => Array.isArray(x) && x.length === 2
        );
        if (!points.length) throw new Error('no prices');
        return points.sort((a, b) => a[0] - b[0]);
      });
    // A failure isn't cached: the next request tries again.
    p.catch(() => cache.delete(currency));
    cache.set(currency, p);
  }
  return p;
};

/**
 * The price at a moment (unix seconds): the latest point at or before it
 * (daily closes, so the price of that day). null time = now = the last
 * point. Before the history starts: null.
 */
export const priceAt = (
  points: PricePoints,
  timeSec: number | null
): number | null => {
  if (timeSec == null) return points[points.length - 1][1];
  const t = timeSec * 1000;
  let price: number | null = null;
  for (const [ms, v] of points) {
    if (ms > t) break;
    price = v;
  }
  return price;
};

/** ◎1.234 for SOL; $1,234.56 / ¥123,456 for fiat. Negative with −. */
export const formatAmount = (
  value: number | null,
  currency: Currency,
  compact = false
): string => {
  if (value == null) return '—';
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  if (currency === 'sol')
    return `${sign}◎${abs.toLocaleString('en-US', {
      minimumFractionDigits: compact ? 0 : 3,
      maximumFractionDigits: compact ? 2 : 3
    })}`;
  return (
    sign +
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: currency === 'jpy' ? 0 : compact ? 1 : 2
    }).format(abs)
  );
};
