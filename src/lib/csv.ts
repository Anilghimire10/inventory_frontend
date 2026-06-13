/** Download an array of rows as a CSV file. */
export function exportCsv(
  filename: string,
  columns: { key: string; label: string }[],
  rows: readonly object[],
) {
  const escape = (val: unknown) => {
    const s = val == null ? '' : String(val);
    // Wrap in quotes if it contains a comma, quote, or newline.
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = columns.map((c) => escape(c.label)).join(',');
  const body = rows
    .map((row) =>
      columns
        .map((c) => escape((row as Record<string, unknown>)[c.key]))
        .join(','),
    )
    .join('\n');
  const csv = `${header}\n${body}`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
