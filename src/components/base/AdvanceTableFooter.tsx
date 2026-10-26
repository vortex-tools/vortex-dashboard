import Pager from 'components/common/Pager';
import { useAdvanceTableContext } from 'providers/AdvanceTableProvider';
import { useRef, useState } from 'react';

/**
 * The paging row under a table from useAdvanceTable: the rows shown out of
 * all of them, a View all / View less toggle, and numbered pages.
 */
const AdvanceTableFooter = () => {
  const table = useAdvanceTableContext();
  const { pageIndex, pageSize } = table.getState().pagination;
  const total = table.getPrePaginationRowModel().rows.length;
  // The page size to go back to from View all.
  const paged = useRef(pageSize);
  const [all, setAll] = useState(false);
  const toggle = () => {
    if (!all) paged.current = pageSize;
    table.setPageSize(all ? paged.current : Math.max(total, 1));
    setAll(!all);
  };
  return (
    <Pager
      page={pageIndex}
      pages={table.getPageCount()}
      onPrev={() => table.previousPage()}
      onNext={() => table.nextPage()}
      onPage={p => table.setPageIndex(p)}
      total={total}
      pageSize={pageSize}
      shown={table.getRowModel().rows.length}
      extra={
        total > paged.current && (
          <button
            type="button"
            className="btn btn-link p-0 fs-9 fw-semibold"
            onClick={toggle}
          >
            {all ? 'View less' : 'View all'}
          </button>
        )
      }
    />
  );
};

export default AdvanceTableFooter;
