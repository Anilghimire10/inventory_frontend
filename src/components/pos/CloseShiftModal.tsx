'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { formatMoney } from '@/lib/format';
import type { Shift } from '@/lib/shift';
import { cn } from '@/lib/utils';

/** Cash-count screen shown when the cashier ends their shift. */
export function CloseShiftModal({
  shift,
  onClose,
  onConfirm,
}: {
  shift: Shift;
  onClose: () => void;
  onConfirm: (countedCash: number, note?: string) => void;
}) {
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const hasCounted = counted.trim() !== '';
  const countedValue = Number(counted) || 0;
  const expected = shift.openingFloat + shift.cashSales;
  const variance = Math.round((countedValue - expected) * 100) / 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Close shift</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <Row label="Opening float" value={formatMoney(shift.openingFloat)} />
          <Row label="Cash sales" value={formatMoney(shift.cashSales)} />
          <Row label="Card sales" value={formatMoney(shift.cardSales)} />
          <Row label="Mobile sales" value={formatMoney(shift.mobileSales)} />
          <Row label="Left on credit" value={formatMoney(shift.creditSales)} />
          <Row
            label={`${shift.salesCount} sale${shift.salesCount !== 1 ? 's' : ''} · gross`}
            value={formatMoney(shift.grossSales)}
          />
          <div className="!mt-2 flex justify-between border-t border-border pt-1.5 font-medium text-foreground">
            <span>Expected cash</span>
            <span>{formatMoney(expected)}</span>
          </div>
        </div>

        <Field label="Cash counted" className="mt-4">
          <Input
            type="number"
            step="0.01"
            min="0"
            autoFocus
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            placeholder="0.00"
          />
        </Field>

        {hasCounted && (
          <div
            className={cn(
              'mt-2 flex items-baseline justify-between rounded-md px-3 py-2 text-sm',
              variance === 0
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive',
            )}
          >
            <span className="font-medium">
              {variance === 0 ? 'Drawer balances' : variance > 0 ? 'Over' : 'Short'}
            </span>
            <span className="text-lg font-bold">{formatMoney(Math.abs(variance))}</span>
          </div>
        )}

        <Field label="Note (optional)" className="mt-3">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. recounted twice"
          />
        </Field>

        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={!hasCounted}
            onClick={() => onConfirm(countedValue, note.trim() || undefined)}
          >
            Close &amp; print Z report
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
