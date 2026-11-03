import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { CSSProperties } from 'react';

/**
 * A Font Awesome icon from its definition, drawn as a plain SVG: what
 * FontAwesomeIcon renders, without @fortawesome/react-fontawesome and
 * fontawesome-svg-core (~60 KB) in the bundle. One em tall, on the text's
 * baseline as theirs; `fixedWidth` makes it 1.25 em wide, `size="2x"`
 * twice the text.
 */
const FaIcon = ({
  icon,
  className = '',
  fixedWidth = false,
  size,
  style
}: {
  icon: IconDefinition;
  className?: string;
  fixedWidth?: boolean;
  size?: '2x';
  style?: CSSProperties;
}) => {
  const [w, h, , , path] = icon.icon;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
      className={`svg-inline--fa ${className}`}
      style={{
        height: '1em',
        width: fixedWidth ? '1.25em' : `${w / h}em`,
        verticalAlign: '-0.125em',
        overflow: 'visible',
        ...(size === '2x' ? { fontSize: '2em' } : {}),
        ...style
      }}
    >
      {(Array.isArray(path) ? path : [path]).map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
};

export default FaIcon;
