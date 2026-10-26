import { ReactNode } from 'react';

/**
 * A non-carded section of a page: a heading (with an optional one-line
 * summary under it and something on the right, e.g. a link), a rule, then
 * its cards. Groups several cards without wrapping them in another card.
 */
const PageSection = ({
  id,
  title,
  summary,
  aside,
  children,
  className = 'mb-4'
}: {
  id?: string;
  /** Omitted where the tab already names the section: the summary line
   *  (and aside) lead instead. */
  title?: string;
  summary?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  // A div, not <section>: the theme pads every section heavily.
  <div id={id} className={className} style={{ scrollMarginTop: 80 }}>
    {title ? (
      <div className="mx-n3 px-3 border-bottom border-translucent pb-1 mb-2">
        <div className="d-flex align-items-baseline justify-content-between gap-3">
          <h4 className="mb-0">{title}</h4>
          {aside && <div className="fs-9">{aside}</div>}
        </div>
        {summary && (
          <p className="fs-9 text-body-secondary mb-0 mt-1">{summary}</p>
        )}
      </div>
    ) : (
      (summary || aside) && (
        <div className="d-flex flex-wrap align-items-baseline justify-content-between column-gap-3 row-gap-1 fs-9 mb-2">
          {summary && <p className="text-body-secondary mb-0">{summary}</p>}
          {aside && <div className="ms-auto">{aside}</div>}
        </div>
      )
    )}
    {children}
  </div>
);

export default PageSection;
