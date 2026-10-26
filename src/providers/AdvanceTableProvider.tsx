import { Table } from '@tanstack/react-table';
import { ReactNode, createContext, useContext } from 'react';

// The table instance from useAdvanceTable, for AdvanceTable and its footer.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TableContext = createContext<Table<any> | null>(null);

/** `<AdvanceTableProvider {...useAdvanceTable(config)}>`: the spread
 *  instance is taken back together as the context value. */
const AdvanceTableProvider = ({
  children,
  ...table
}: { children: ReactNode } & object) => (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  <TableContext.Provider value={table as Table<any>}>
    {children}
  </TableContext.Provider>
);

export const useAdvanceTableContext = <T,>(): Table<T> => {
  const table = useContext(TableContext);
  if (!table) throw new Error('useAdvanceTableContext outside a provider');
  return table as Table<T>;
};

export default AdvanceTableProvider;
