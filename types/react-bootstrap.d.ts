// react-bootstrap's Button rendered as a router link
// (`<Button as={Link} to="...">`).
import { ElementType } from 'react';
import { To } from 'react-router';

declare module 'react-bootstrap' {
  interface ButtonProps {
    as?: ElementType;
    to?: To;
  }
}
