import { Header, flexRender } from '@tanstack/react-table';
import InfoTip from 'components/common/InfoTip';
import { useAdvanceTableContext } from 'providers/AdvanceTableProvider';
import { Table, TableProps } from 'react-bootstrap';

/** "sort asc" / "sort desc" / "sort" on a sortable header (the arrow). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sortClass = (h: Header<any, unknown>) => {
  if (h.isPlaceholder || !h.column.getCanSort()) return undefined;
  const dir = h.column.getIsSorted();
  return dir ? `sort ${dir}` : 'sort';
};

/**
 * Renders the table from AdvanceTableProvider: every header level (a
 * column group's header spans its columns), pinned-top rows first, then
 * the page. Column meta: `headerProps` on the <th>, `cellProps` on each
 * <td>.
 */
const AdvanceTable = ({ tableProps }: { tableProps?: TableProps }) => {
  const table = useAdvanceTableContext();
  const rows = [...table.getTopRows(), ...table.getCenterRows()];
  return (
    <div className="scrollbar">
      <Table {...tableProps}>
        <thead>
          {table.getHeaderGroups().map(group => (
            <tr key={group.id}>
              {group.headers.map(h => {
                const { title: hint, ...meta } =
                  h.column.columnDef.meta?.headerProps ?? {};
                const sort = sortClass(h);
                return (
                  <th
                    key={h.id}
                    colSpan={h.colSpan > 1 ? h.colSpan : undefined}
                    {...meta}
                    className={
                      [meta.className, sort].filter(Boolean).join(' ') ||
                      undefined
                    }
                    onClick={
                      sort ? h.column.getToggleSortingHandler() : undefined
                    }
                  >
                    {!h.isPlaceholder &&
                      flexRender(h.column.columnDef.header, h.getContext())}
                    {/* A header's explanation: an InfoTip, not a slow
                        title attribute (it stops the click from sorting). */}
                    {hint && (
                      <InfoTip size={11} className="ms-1">
                        {hint}
                      </InfoTip>
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={row.id}
              className={row.getIsPinned() ? 'pinned-row' : undefined}
            >
              {row.getVisibleCells().map(cell => (
                <td key={cell.id} {...cell.column.columnDef.meta?.cellProps}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};

export default AdvanceTable;
