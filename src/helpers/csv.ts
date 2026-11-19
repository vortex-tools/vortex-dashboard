/** A CSV cell: quoted when it holds a quote, comma or newline. */
export const csvCell = (v: string | number | null | undefined) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Exact SOL from lamports (9 decimals, no float rounding), for CSVs. */
export const csvSol = (lamports: number | null | undefined) => {
  if (lamports == null) return '';
  const neg = lamports < 0;
  const s = BigInt(Math.round(Math.abs(lamports)))
    .toString()
    .padStart(10, '0');
  return `${neg ? '-' : ''}${s.slice(0, -9)}.${s.slice(-9)}`;
};

/** Saves rows as a CSV file (a header line, then one line per row). */
export const downloadCsv = (
  filename: string,
  header: string[],
  rows: Array<Array<string | number | null | undefined>>
) => {
  const lines = [
    header.map(csvCell).join(','),
    ...rows.map(r => r.map(csvCell).join(','))
  ];
  const url = URL.createObjectURL(
    new Blob([lines.join('\n') + '\n'], { type: 'text/csv' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
