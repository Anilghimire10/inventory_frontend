import { saveFile } from './save-file';

/**
 * One CSV cell. Quoted when it has to be. Text starting with = + - @ gets an
 * apostrophe in front, so a product or customer named "=HYPERLINK(...)"
 * can't run as a formula when the file is opened in Excel; real numbers
 * (a negative amount) are left alone. The product import takes the
 * apostrophe back off.
 */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The file's text: a byte-order mark first, so Excel reads Nepali and other
 * non-English text as UTF-8 instead of showing garbage, then CRLF rows.
 */
export function toCsv(columns: { key: string; label: string }[], rows: readonly object[]) {
  const lines = [
    columns.map((c) => csvCell(c.label)).join(','),
    ...rows.map((row) => columns.map((c) => csvCell((row as Record<string, unknown>)[c.key])).join(',')),
  ];
  return '\uFEFF' + lines.join('\r\n');
}

/** Save rows as a CSV file: a download, or the share sheet in the Android app. */
export function exportCsv(
  filename: string,
  columns: { key: string; label: string }[],
  rows: readonly object[],
) {
  return saveFile(filename.endsWith('.csv') ? filename : `${filename}.csv`, toCsv(columns, rows), 'text/csv;charset=utf-8');
}

/**
 * Parse CSV text into row objects keyed by the header row. Handles quoted
 * fields, escaped quotes (""), and commas/newlines inside quotes.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  const t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  // Flush trailing field/row.
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonEmpty.length < 2) return [];

  const headers = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
}
