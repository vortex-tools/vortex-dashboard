import FeatherIcon from 'feather-icons-react';
import { ReactNode } from 'react';

/**
 * Explains why a section has no data on this cluster (e.g. block income on
 * testnet), instead of showing zeros or a blank chart.
 */
const UntrackedState = ({
  children,
  className = ''
}: {
  children: ReactNode;
  className?: string;
}) => (
  <p
    className={`d-flex align-items-center gap-2 text-body-tertiary fs-9 mb-0 ${className}`}
  >
    <FeatherIcon icon="info" size={14} className="flex-shrink-0" />
    <span>{children}</span>
  </p>
);

export default UntrackedState;
