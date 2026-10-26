import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronLeft,
  faChevronRight
} from '@fortawesome/free-solid-svg-icons';
import { pageWindow } from 'helpers/pageWindow';
import { ReactNode } from 'react';
import { Pagination } from 'react-bootstrap';

/**
 * The paging row under a hand-paged table, in the leaderboard table
 * footer's style (AdvanceTableFooter): "1-25 of 173" (or a note)
 * on the left, chevrons around numbered pages on the right. Without
 * `onPage` (cursor-paged tables) only the current page shows between the
 * chevrons.
 */
const Pager = ({
  page,
  pages,
  onPrev,
  onNext,
  onPage,
  prevDisabled,
  nextDisabled,
  total,
  pageSize,
  shown,
  note,
  extra,
  className
}: {
  /** 0-based. */
  page: number;
  pages: number;
  onPrev: () => void;
  onNext: () => void;
  /** Jump to a page (0-based): numbered pages when set. */
  onPage?: (page: number) => void;
  /** Override the default first / last page checks. */
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  /** All rows and rows per page, for "1-25 of 173". */
  total?: number;
  pageSize?: number;
  /** Rows on this page (defaults to a full page). */
  shown?: number;
  note?: ReactNode;
  /** After the count (e.g. a View all toggle). */
  extra?: ReactNode;
  /** Extra classes on the row (e.g. padding in a full-width table). */
  className?: string;
}) => {
  const first = pageSize != null ? page * pageSize + 1 : null;
  const last =
    first != null && pageSize != null
      ? Math.min(first - 1 + (shown ?? pageSize), total ?? Infinity)
      : null;
  const item = (p: number) => (
    <Pagination.Item key={p} active={p === page} onClick={() => onPage?.(p)}>
      {p + 1}
    </Pagination.Item>
  );
  return (
    <div
      className={`d-flex align-items-center gap-3 fs-9 mt-3${className ? ` ${className}` : ''}`}
    >
      <p className="mb-0 d-none d-sm-block fw-semibold text-body">
        {total != null && first != null && last != null ? (
          <>
            {first.toLocaleString()}–{last.toLocaleString()}
            <span className="text-body-tertiary"> of </span>
            {total.toLocaleString()}
          </>
        ) : (
          note
        )}
      </p>
      {extra}
      <Pagination className="mb-0 ms-auto">
        <Pagination.Prev disabled={prevDisabled ?? page <= 0} onClick={onPrev}>
          <FontAwesomeIcon icon={faChevronLeft} />
        </Pagination.Prev>
        {onPage ? (
          pageWindow(page, pages).map((p, i) =>
            p == null ? (
              <Pagination.Ellipsis key={`gap-${i}`} disabled />
            ) : (
              item(p)
            )
          )
        ) : (
          <Pagination.Item active>{page + 1}</Pagination.Item>
        )}
        <Pagination.Next
          disabled={nextDisabled ?? page >= pages - 1}
          onClick={onNext}
        >
          <FontAwesomeIcon icon={faChevronRight} />
        </Pagination.Next>
      </Pagination>
    </div>
  );
};

export default Pager;
