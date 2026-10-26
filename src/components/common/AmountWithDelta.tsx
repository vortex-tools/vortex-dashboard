import Badge from 'components/base/Badge';
import { formatLamports } from 'helpers/utils';

// Colored soft badge showing % delta vs a baseline.
export const DeltaBadge = ({
  value,
  baseline
}: {
  value: number;
  baseline: number | undefined;
}) => {
  if (baseline === undefined || baseline === 0) return null;
  const pct = ((value - baseline) / baseline) * 100;
  const threshold = 1; // ±1% considered "on median"
  let bg: 'success' | 'danger' | 'secondary';
  if (pct > threshold) bg = 'success';
  else if (pct < -threshold) bg = 'danger';
  else bg = 'secondary';
  const sign = pct >= 0 ? '+' : '';
  return (
    <Badge variant="soft" bg={bg} className="ms-2 fs-10">
      {sign}
      {pct.toFixed(1)}%
    </Badge>
  );
};

// Lamports amount rendered as SOL with a colored delta badge beside it.
const AmountWithDelta = ({
  value,
  baseline,
  digits
}: {
  value: number;
  baseline: number | undefined;
  digits?: number;
}) => (
  <span className="d-inline-flex align-items-center">
    <span className="font-monospace">{formatLamports(value, digits)}</span>
    <DeltaBadge value={value} baseline={baseline} />
  </span>
);

export default AmountWithDelta;
