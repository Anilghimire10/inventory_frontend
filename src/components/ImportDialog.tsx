'use client';
import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileUp } from 'lucide-react';
import { parseCsv } from '@/lib/csv';
import { apiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type ImportProblem = { row: number; error: string };

/** What the server says a file would do, before anything is saved. */
export interface ImportCheck {
  /** "New products: 12", "Updated: 40" ... */
  counts: { label: string; value: number }[];
  /** How many rows importing would write; 0 disables the Import button. */
  toImport: number;
  errors: ImportProblem[];
}

/**
 * Import from a spreadsheet in three steps: choose a file, see what it will
 * do (and every row that's wrong, by its line in the file), then import.
 * Nothing is saved until the last step, and rows with problems are skipped,
 * not guessed at.
 */
export function ImportDialog({
  open,
  onClose,
  title,
  intro,
  columns,
  onTemplate,
  check,
  run,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  intro: string;
  /** The columns the file may have, and what each takes. */
  columns: { name: string; note: string; required?: boolean }[];
  onTemplate: () => void;
  check: (rows: Record<string, string>[]) => Promise<ImportCheck>;
  /** Imports, and returns the success line plus any rows that still failed. */
  run: (rows: Record<string, string>[]) => Promise<{ message: string; errors: ImportProblem[] }>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [result, setResult] = useState<ImportCheck | null>(null);
  const [done, setDone] = useState<{ message: string; errors: ImportProblem[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const reset = () => {
    setFileName('');
    setRows([]);
    setResult(null);
    setDone(null);
    setProblem(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    reset();
    setFileName(file.name);
    setBusy(true);
    try {
      const parsed = parseCsv(await file.text());
      if (!parsed.length) {
        setProblem('No rows found. The first line should be the column names, with one row per line below it.');
        return;
      }
      setRows(parsed);
      setResult(await check(parsed));
    } catch (err) {
      setProblem(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setBusy(true);
    try {
      setDone(await run(rows));
    } catch (err) {
      setProblem(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const toDo = result?.toImport ?? 0;
  const errors = done ? done.errors : (result?.errors ?? []);

  return (
    <Dialog open={open} onClose={close} title={title} className="max-w-2xl">
      <div className="space-y-4 text-sm">
        {!result && !done && (
          <>
            <p className="text-muted-foreground">{intro}</p>
            <details className="rounded-md border border-border p-3">
              <summary className="cursor-pointer font-medium">Columns the file can have</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {columns.map((c) => (
                  <li key={c.name}>
                    <span className="font-mono font-medium">{c.name}</span>
                    {c.required && <span className="text-destructive"> (required)</span>} — {c.note}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Save from Excel as “CSV UTF-8”. A blank cell leaves that value as it is.
              </p>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onTemplate}>
                <Download className="h-4 w-4" /> Download template
              </Button>
              <Button loading={busy} onClick={() => fileRef.current?.click()}>
                <FileUp className="h-4 w-4" /> Choose file
              </Button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onPick} />
            </div>
          </>
        )}

        {problem && (
          <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {problem}
          </p>
        )}

        {result && !done && (
          <div className="space-y-3">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{fileName}</span>: {rows.length} row{rows.length === 1 ? '' : 's'}.
              Nothing has been saved yet.
            </p>
            <div className="flex flex-wrap gap-3">
              {result.counts.map((c) => (
                <div key={c.label} className="rounded-md border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className="text-lg font-semibold">{c.value}</p>
                </div>
              ))}
              <div className={cn('rounded-md border px-3 py-2', errors.length ? 'border-destructive/40' : 'border-border')}>
                <p className="text-xs text-muted-foreground">Rows with problems</p>
                <p className={cn('text-lg font-semibold', errors.length && 'text-destructive')}>{errors.length}</p>
              </div>
            </div>
          </div>
        )}

        {done && (
          <p className="flex items-start gap-2 rounded-md border border-success/30 bg-success/10 p-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {done.message}
          </p>
        )}

        {errors.length > 0 && (
          <div>
            <p className="mb-1 font-medium">
              {done ? 'These rows were not imported:' : 'These rows will be skipped. Fix them in the file and choose it again, or import the rest.'}
            </p>
            <div className="max-h-56 overflow-y-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr className="text-left">
                    <th className="px-3 py-1.5 font-medium">Line</th>
                    <th className="px-3 py-1.5 font-medium">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((e) => (
                    // Row 1 is the first line under the column names: line 2 in the file.
                    <tr key={`${e.row}-${e.error}`} className="border-t border-border">
                      <td className="px-3 py-1.5 font-mono">{e.row + 1}</td>
                      <td className="px-3 py-1.5">{e.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <DialogFooter>
        {done ? (
          <Button onClick={close}>Done</Button>
        ) : result ? (
          <>
            <Button variant="outline" onClick={reset}>Choose another file</Button>
            <Button loading={busy} disabled={toDo === 0} onClick={doImport}>
              Import {toDo} row{toDo === 1 ? '' : 's'}
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={close}>Cancel</Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
