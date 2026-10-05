'use client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter } from '@/components/ui/dialog';

// What the till's keydown handler in PosPage actually does. The letter
// shortcuts need Ctrl (⌘ on a Mac): bare letters would fire while a
// scanner types a code into the page.
const SHORTCUTS: [keys: string, what: string][] = [
  ['/ or Ctrl+K', 'Search products'],
  ['T', 'Jump to amount tendered'],
  ['Enter', 'One more of the last item'],
  ['Tab', 'Next payment method'],
  ['Ctrl+H', 'Hold the sale'],
  ['Ctrl+D', 'Discount as amount or percent'],
  ['Ctrl+P', 'Print the last receipt'],
  ['Esc', 'Clear the search'],
];

/** The till's keyboard shortcuts, in a proper dialog: focus trapped, Esc closes. */
export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" description="Ctrl is ⌘ on a Mac." className="max-w-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={keys} className="contents">
            <dt>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
            </dt>
            <dd className="text-muted-foreground">{what}</dd>
          </div>
        ))}
      </dl>
      <DialogFooter>
        <Button onClick={onClose}>Close</Button>
      </DialogFooter>
    </Dialog>
  );
}
