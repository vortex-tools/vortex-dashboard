import FeatherIcon from 'feather-icons-react';
import { ReactNode } from 'react';
import { Link } from 'react-router';

interface Props {
  label: string;
  value: ReactNode;
  /** Small line beneath the value (e.g. `Current epoch`). */
  sublabel?: ReactNode;
  /** When set, the whole card becomes a link; an arrow-up-right icon shows in
   *  the top-right corner. */
  linkTo?: string;
  /** Monospace value - right for numbers; turn off for words. */
  mono?: boolean;
  /** Let a long sublabel wrap instead of truncating. */
  wrapSublabel?: boolean;
  /** Needs attention: the value in warning / danger. */
  tone?: 'warning' | 'danger';
  /** A threshold it is judged against: met (a green check, the card
   *  tinted) or not (a red cross). */
  check?: boolean | null;
}

/**
 * Bordered stat tile used in KPI strips across the app.
 *
 *   ┌──────────────────────┐
 *   │ label              ↗ │  (arrow only when `linkTo` is set)
 *   │ 1,234                │
 *   │ sublabel             │
 *   └──────────────────────┘
 */
const StatCard = ({
  label,
  value,
  sublabel,
  linkTo,
  mono = true,
  wrapSublabel = false,
  tone,
  check
}: Props) => {
  const body = (
    <>
      <div className="d-flex justify-content-between align-items-start">
        <p className="text-body-tertiary fs-10 mb-1 mt-0">{label}</p>
        {check != null ? (
          <FeatherIcon
            icon={check ? 'check-circle' : 'x-circle'}
            size={14}
            className={check ? 'text-success' : 'text-danger'}
            aria-label={check ? 'Met' : 'Not met'}
          />
        ) : (
          linkTo && (
            <FeatherIcon
              icon="arrow-up-right"
              size={12}
              className="text-body-tertiary"
            />
          )
        )}
      </div>
      {/* Truncate rather than overflow the card; the full value stays
          available on hover when it is plain text. */}
      <p
        className={`fs-7 fw-bolder mb-0 text-truncate${mono ? ' font-monospace' : ''}${tone ? ` text-${tone}` : ''}`}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </p>
      {sublabel && (
        <p
          className={`text-body-tertiary fs-10 mb-0 mt-1${wrapSublabel ? '' : ' text-truncate'}`}
          title={typeof sublabel === 'string' ? sublabel : undefined}
        >
          {sublabel}
        </p>
      )}
    </>
  );
  const frame =
    check === true
      ? 'bg-success-subtle border-success-subtle'
      : check === false
        ? 'bg-body-emphasis border-danger-subtle'
        : 'bg-body-emphasis border-translucent';
  if (linkTo) {
    return (
      <Link
        to={linkTo}
        className={`stat-card d-block position-relative overflow-hidden rounded border ${frame} px-3 py-2 h-100 text-decoration-none text-body`}
      >
        {body}
      </Link>
    );
  }
  return (
    <div
      className={`stat-card position-relative overflow-hidden rounded border ${frame} px-3 py-2 h-100`}
    >
      {body}
    </div>
  );
};

export default StatCard;
