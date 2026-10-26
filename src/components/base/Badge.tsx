import { HTMLAttributes } from 'react';

export type BadgeBg =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info';

/**
 * A soft badge: tinted background, colored text (`badge-soft-*` in
 * vx/_components). `variant` is kept for call sites; soft is the only one.
 */
const Badge = ({
  bg = 'secondary',
  variant: _variant,
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { bg?: BadgeBg; variant?: 'soft' }) => (
  <span
    className={['badge badge-soft', `badge-soft-${bg}`, className]
      .filter(Boolean)
      .join(' ')}
    {...rest}
  />
);

export default Badge;
