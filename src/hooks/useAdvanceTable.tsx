import {
  ColumnDef,
  InitialTableState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { useEffect, useRef } from 'react';

interface Options<T> {
  columns: ColumnDef<T>[];
  data: T[];
  sortable?: boolean;
  /** Paged (pageSize rows a page) or every row on one page. */
  pagination?: boolean;
  pageSize?: number;
  /** Accepted for old call sites; there is no selection column. */
  selection?: false;
  initialState?: InitialTableState;
  getRowId?: (row: T, index: number) => string;
  /**
   * What the rows are of (e.g. the picked epoch). When it changes the
   * table goes back to page 1; plain data refreshes keep the page.
   */
  resetPageKey?: string | number;
}

/**
 * A TanStack table with sorting, filtering and paging, for
 * AdvanceTableProvider. The page survives data refreshes (the live
 * leaderboards refresh while being read): it resets only when the view is
 * re-scoped - resetPageKey, a filter or the sort changes - and is pulled
 * back to the last page when a refresh leaves it past the end.
 */
const useAdvanceTable = <T,>({
  columns,
  data,
  sortable,
  pagination,
  pageSize,
  initialState,
  getRowId,
  resetPageKey
}: Options<T>) => {
  const table = useReactTable<T>({
    data,
    columns,
    getRowId,
    enableSorting: sortable,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      ...(pagination && pageSize
        ? { pagination: { pageIndex: 0, pageSize } }
        : {}),
      ...initialState
    }
  });

  const s = table.getState();
  const scope = JSON.stringify([
    resetPageKey ?? null,
    s.globalFilter ?? null,
    s.columnFilters,
    s.sorting
  ]);
  const seen = useRef(scope);
  useEffect(() => {
    if (seen.current !== scope) {
      seen.current = scope;
      table.setPageIndex(0);
    }
  }, [scope, table]);

  const pages = table.getPageCount();
  const page = s.pagination.pageIndex;
  useEffect(() => {
    if (pages > 0 && page >= pages) table.setPageIndex(pages - 1);
  }, [pages, page, table]);

  return table;
};

export default useAdvanceTable;
