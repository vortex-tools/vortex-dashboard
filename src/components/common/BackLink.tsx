import FeatherIcon from 'feather-icons-react';
import { Link } from 'react-router';

/** A detail page's way back to its list ("← All feature gates"), at the
 *  right of its header. */
const BackLink = ({
  to,
  label,
  stretch = false
}: {
  to: string;
  label: string;
  /** Fill the height of its flex row (beside a search box). */
  stretch?: boolean;
}) => (
  <Link
    to={to}
    className={`btn btn-soft-secondary d-inline-flex align-items-center gap-1 text-nowrap ${
      stretch ? 'align-self-stretch fs-9 px-3' : 'btn-sm'
    }`}
  >
    <FeatherIcon icon="arrow-left" size={12} />
    {label}
  </Link>
);

export default BackLink;
