'use client';
import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { CASH_REASON_LABEL, CASH_REASONS } from '@/lib/cash';
import { formatMoney, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CashMovement, CashMovementReason, CashMovementType } from '@/types';

/**
 * Pay in / pay out: cash into or out of the drawer that isn't a sale.
 *
 * Every rupee taken out for tea or a supplier used to surface at close as the
 * cashier being short. Recording it here moves the expected cash with it, and
 * the Z report lists each one. There is no edit or delete -- a mistake is
 * put right with the opposite movement, so the drawer's story always adds up.
 */
export function CashMovementModal({
  open,
  onClose,
  onSubmit,
  isPending,
  movements,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (body: {
    type: CashMovementType;
    reason: CashMovementReason;
    amount: number;
    note?: string;
  }) => Promise<void>;
  isPending?: boolean;
  /** This shift's movements so far, newest last. */
  movements: CashMovement[];
}) {
  const [type, setType] = useState<CashMovementType>('PAY_OUT');
  const [reason, setReason] = useState<CashMovementReason>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const value = Number(amount) || 0;
  const needsNote = reason === 'OTHER' && !note.trim();
  const canSubmit = value > 0 && !needsNote;

  const pickType = (next: CashMovementType) => {
    setType(next);
    setReason(CASH_REASONS[next][0]);
  };

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await onSubmit({ type, reason, amount: value, note: note.trim() || undefined });
    } catch {
      return; // the caller showed the error; keep what was typed
    }
    setAmount('');
    setNote('');
  };

  return (
    <Dialog
      open={open}
      onClose={isPending ? () => {} : onClose}
      title="Cash in / out"
      description="Cash put into or taken out of the drawer that isn’t a sale."
      className="max-w-md"
    >
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Direction">
        <DirectionButton
          active={type === 'PAY_OUT'}
          onClick={() => pickType('PAY_OUT')}
          icon={<ArrowUpFromLine className="h-4 w-4" />}
          label="Pay out"
          hint="Cash leaves the drawer"
        />
        <DirectionButton
          active={type === 'PAY_IN'}
          onClick={() => pickType('PAY_IN')}
          icon={<ArrowDownToLine className="h-4 w-4" />}
          label="Pay in"
          hint="Cash goes into the drawer"
        />
      </div>

      <div className="mt-4">
        <div className="mb-1.5 text-sm font-medium">Reason</div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Reason">
          {CASH_REASONS[type].map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              onClick={() => setReason(r)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                reason === r
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent',
              )}
            >
              {CASH_REASON_LABEL[r]}
            </button>
          ))}
        </div>
        {reason === 'SUPPLIER' && (
          <p className="mt-2 text-xs text-muted-foreground">
            This only records the cash leaving the drawer. Record the payment on the
            purchase too, so the supplier’s balance goes down.
          </p>
        )}
      </div>

      <Field label="Amount" className="mt-4">
        <Input
          type="number"
          step="0.01"
          min="0"
          autoFocus
          disabled={isPending}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
          placeholder="0.00"
        />
      </Field>
      <Field
        label={reason === 'OTHER' ? 'What was it for?' : 'Note (optional)'}
        className="mt-3"
      >
        <Input
          disabled={isPending}
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          placeholder={type === 'PAY_OUT' ? 'e.g. tea for staff' : 'e.g. change from the bank'}
        />
      </Field>

      {movements.length > 0 && (
        <div className="mt-4 rounded-lg border border-border">
          <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
            This shift
          </div>
          <ul className="max-h-40 divide-y divide-border overflow-y-auto text-sm">
            {movements.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate">
                    {CASH_REASON_LABEL[m.reason]}
                    {m.note ? ` — ${m.note}` : ''}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatTime(m.createdAt)} · {m.user?.name ?? '—'}
                  </span>
                </span>
                <span
                  className={cn(
                    'shrink-0 font-medium',
                    m.type === 'PAY_IN' ? 'text-success' : 'text-destructive',
                  )}
                >
                  {m.type === 'PAY_IN' ? '+' : '−'}
                  {formatMoney(m.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Entries can’t be edited. To fix a mistake, record the opposite movement.
      </p>

      <DialogFooter>
        <Button variant="outline" disabled={isPending} onClick={onClose}>
          Done
        </Button>
        <Button loading={isPending} disabled={!canSubmit} onClick={() => void submit()}>
          {type === 'PAY_OUT' ? 'Pay out' : 'Pay in'} {value > 0 ? formatMoney(value) : ''}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function DirectionButton({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors',
        active ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        {icon} {label}
      </span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}
