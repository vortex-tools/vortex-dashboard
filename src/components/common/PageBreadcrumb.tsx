import { Fragment } from 'react';
import { Link } from 'react-router';

/** One step of the trail: a link (`url`), the current page (`active`),
 *  or plain text. */
export interface Crumb {
  label: string;
  url?: string;
  active?: boolean;
}

/** Off for now (2026-10-23): pages lead with their compact header row;
 *  tabs, epoch pickers and the sidebar cover the way back. Flip it to bring
 *  the trail back on every page. */
const BREADCRUMBS = false;

/** The trail above a page, in its own ruled bar under the top bar. */
const PageBreadcrumb = ({
  items,
  className
}: {
  items: Crumb[];
  className?: string;
}) => {
  if (!BREADCRUMBS) return null;
  return (
    <nav
      aria-label="Breadcrumb"
      className={['breadcrumb-bar fs-9', className].filter(Boolean).join(' ')}
    >
      {items.map((c, i) => (
        <Fragment key={c.label}>
          {i > 0 && <span className="text-body-quaternary mx-2">/</span>}
          {c.url && !c.active ? (
            <Link to={c.url}>{c.label}</Link>
          ) : (
            <span
              className={c.active ? 'text-body' : 'text-body-tertiary'}
              aria-current={c.active ? 'page' : undefined}
            >
              {c.label}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  );
};

export default PageBreadcrumb;
