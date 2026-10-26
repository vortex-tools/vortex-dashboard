import { Button as BsButton, ButtonProps } from 'react-bootstrap';

/** react-bootstrap's Button, with the theme's soft variants typed in
 *  (`btn-soft-*` in vx/_components). */
export type ButtonVariant = ButtonProps['variant'] | `soft-${string}`;

const Button = (
  props: Omit<ButtonProps, 'variant'> & { variant?: ButtonVariant }
) => <BsButton {...props} />;

export default Button;
