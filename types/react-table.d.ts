// Per-column attributes for AdvanceTable: spread onto the column's <th>
// and onto each of its <td>s.
import '@tanstack/react-table';
import { TdHTMLAttributes, ThHTMLAttributes } from 'react';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    headerProps?: ThHTMLAttributes<HTMLTableCellElement>;
    cellProps?: TdHTMLAttributes<HTMLTableCellElement>;
  }
}
