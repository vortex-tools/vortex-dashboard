import FeatherIcon from 'feather-icons-react';
import InfoTip from 'components/common/InfoTip';
import { ReactNode } from 'react';
import { Link } from 'react-router';

interface Props {
  /** Text, or text with a link in it. */
  title: ReactNode;
  /** Feather icon shown to the left of the title. */
  icon: string;
  /** Top-right link target. Omit both `linkTo` and `linkLabel` for a
   *  header-only card. */
  linkTo?: string;
  linkLabel?: string;
  /** What the card shows, on hover of an info icon by the title (instead
   *  of small print in the card). */
  info?: string;
  /** Beside the title (e.g. a status badge). */
  badge?: ReactNode;
  /** Ring the card in the primary color (e.g. while it's held). */
  highlight?: boolean;
  /** Header, right-hand side (e.g. a view toggle), before any link. */
  aside?: ReactNode;
  children: ReactNode;
}

/**
 * Surface for a titled section with an optional top-right link. Used by
 * "Recent Voting" / "Recent Income" mini-tables and similar card groupings.
 */
const SectionCard = ({
  title,
  icon,
  linkTo,
  linkLabel,
  info,
  badge,
  highlight = false,
  aside,
  children
}: Props) => (
  <div
    className={`section-card bg-body-emphasis rounded border p-3 h-100 d-flex flex-column ${
      highlight ? 'border-primary' : 'border-translucent'
    }`}
    style={
      highlight
        ? {
            boxShadow: '0 0 0 3px var(--vx-primary-bg-subtle)',
            transition: 'box-shadow 150ms, border-color 150ms'
          }
        : { transition: 'box-shadow 150ms, border-color 150ms' }
    }
  >
    {/* Wraps on a narrow screen: a toggle beside a long title drops
        below it rather than widening the page. */}
    <div className="d-flex flex-wrap align-items-center justify-content-between column-gap-2 row-gap-2 mt-n1 mx-n3 px-3 pb-2 mb-3 border-bottom border-translucent">
      <div className="d-flex align-items-center">
        <FeatherIcon icon={icon} size={16} className="text-primary me-2" />
        <h6 className="mb-0">{title}</h6>
        {badge}
        {info && <InfoTip>{info}</InfoTip>}
      </div>
      {aside}
      {linkTo && linkLabel && (
        <Link to={linkTo} className="fs-9">
          {linkLabel} →
        </Link>
      )}
    </div>
    {children}
  </div>
);

export default SectionCard;
