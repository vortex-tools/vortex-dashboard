import FeatherIcon from 'feather-icons-react';
import { ReactNode } from 'react';

interface Props {
  /** Feather icon name (e.g. 'alert-octagon', 'alert-triangle'). */
  icon?: string;
  /** Extra classes on the outer `<div>`, e.g. to tweak margin. */
  className?: string;
  children: ReactNode;
}

const WarningBanner = ({
  icon = 'alert-octagon',
  className = 'mb-3',
  children
}: Props) => (
  <div
    className={`d-flex align-items-center bg-warning-subtle rounded py-1 px-2 fs-9 ${className}`}
  >
    <FeatherIcon
      icon={icon}
      size={14}
      className="me-2 flex-shrink-0 text-warning"
    />
    <span>{children}</span>
  </div>
);

export default WarningBanner;
