import FeatherIcon from 'feather-icons-react';
import { Link } from 'react-router';

/** A detail page's way back to its list ("← All feature gates"), at the
 *  right of its header. */
const BackLink = ({ to, label }: { to: string; label: string }) => (
  <Link
    to={to}
    className="btn btn-soft-secondary btn-sm d-inline-flex align-items-center gap-1 text-nowrap"
  >
    <FeatherIcon icon="arrow-left" size={12} />
    {label}
  </Link>
);

export default BackLink;
