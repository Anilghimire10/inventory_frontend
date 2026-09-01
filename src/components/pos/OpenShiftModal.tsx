'use client';
import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { formatMoney } from '@/lib/format';

/** Blocks POS checkout until the cashier counts a starting float. */
export function OpenShiftModal({
  onOpen,
  isPending,
}: {
  onOpen: (openingFloat: number, note?: string) => void;
  isPending?: boolean;
}) {
  const [float, setFloat] = useState('');
  const [note, setNote] = useState('');
  const value = Math.max(0, Number(float) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-foreground">Open your shift</h2>
            <p className="text-xs text-muted-foreground">Count the drawer before your first sale.</p>
          </div>
        </div>

        <Field label="Opening float">
          <Input
            type="number"
            step="0.01"
            min="0"
            autoFocus
            disabled={isPending}
            value={float}
            onChange={(e) => setFloat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onOpen(value, note.trim() || undefined);
            }}
            placeholder="0.00"
          />
        </Field>
        <Field label="Note (optional)" className="mt-3">
          <Input
            disabled={isPending}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. till 2"
          />
        </Field>

        <Button
          className="mt-5 h-11 w-full"
          loading={isPending}
          onClick={() => onOpen(value, note.trim() || undefined)}
        >
          Open shift with {formatMoney(value)}
        </Button>
      </div>
    </div>
  );
}
