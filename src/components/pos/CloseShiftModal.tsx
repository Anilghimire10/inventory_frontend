'use client';
import { useRef, useState } from 'react';
import { EyeOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Hint, Tooltip } from '@/components/ui/tooltip';
import { formatMoney } from '@/lib/format';
import { countTotal, denominationsFor } from '@/lib/cash';
import type { CloseShiftBody } from '@/api';
import type { ShiftReport } from '@/types';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/useFocusTrap';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Cash-count screen shown when the cashier ends their shift. */
export function CloseShiftModal({
  shift,
  currency,
  onClose,
  onConfirm,
  isPending,
}: {
  shift: ShiftReport;
  /** The business's currency, which decides the notes offered for counting. */
  currency?: string;
  onClose: () => void;
  onConfirm: (body: CloseShiftBody) => void;
  isPending?: boolean;
}) {
  const denominations = denominationsFor(currency);
  const [byNotes, setByNotes] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState('');
  // The float carries over unless the cashier says otherwise: most shops
  // start every day with the same change in the drawer.
  const [left, setLeft] = useState(String(Number(shift.openingFloat) || ''));
  const [note, setNote] = useState('');

  const noteCounts = Object.fromEntries(
    Object.entries(notes).map(([d, q]) => [d, Math.max(0, Math.floor(Number(q) || 0))]),
  );
  const counted = byNotes ? countTotal(noteCounts) : Number(typed) || 0;
  const hasCounted = byNotes
    ? Object.values(noteCounts).some((q) => q > 0)
    : typed.trim() !== '';
  const cashLeft = left.trim() === '' ? undefined : Math.max(0, Number(left) || 0);
  const leftTooMuch = cashLeft !== undefined && cashLeft > counted;

  const blind = shift.blindClose;
  const variance =
    shift.expectedCash === null ? null : round2(counted - shift.expectedCash);
  const noteRequired =
    !blind &&
    hasCounted &&
    variance !== null &&
    shift.varianceNoteOver !== null &&
    Math.abs(variance) > shift.varianceNoteOver;
  const canClose = hasCounted && !leftTooMuch && !(noteRequired && !note.trim());

  const openingDiff =
    shift.carriedFloat === null ? 0 : round2(Number(shift.openingFloat) - shift.carriedFloat);

  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, true, isPending ? undefined : onClose);

  const confirm = () =>
    onConfirm({
      countedCash: round2(counted),
      cashLeft,
      ...(byNotes ? { cashCount: noteCounts } : {}),
      note: note.trim() || undefined,
    });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-shift-title"
        className="my-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg"
      >
        <div className="mb-4 flex items-center justify-between">
          {/* Whose drawer is being counted. An owner can be closing a till
              someone else opened, and the variance lands against that person
              -- so the heading names them rather than saying "Close shift"
              and leaving it to be assumed. */}
          <h2 id="close-shift-title" className="text-base font-semibold text-foreground">
            {shift.isOwnShift === false
              ? `Close ${shift.user?.name ?? 'this user'}’s till`
              : 'Close shift'}
          </h2>
          <Tooltip content="Close">
            <button
              type="button"
              onClick={onClose}
              aria-label="Cancel"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>

        <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <Row label="Opening float" value={formatMoney(shift.openingFloat)} />
          {openingDiff !== 0 && (
            <p className="text-xs text-warning">
              The last shift left {formatMoney(shift.carriedFloat)} — this drawer opened{' '}
              {formatMoney(Math.abs(openingDiff))} {openingDiff < 0 ? 'short' : 'over'}.
            </p>
          )}
          {shift.byTender.map((t) => (
            <Row
              key={t.method}
              label={`${t.method} (${t.count})`}
              value={formatMoney(t.amount)}
            />
          ))}
          {!!shift.creditCollected && (
            <Row label="Credit collected (cash)" value={formatMoney(shift.creditCollected)} />
          )}
          {shift.payIns > 0 && <Row label="Paid in" value={`+${formatMoney(shift.payIns)}`} />}
          {shift.payOuts > 0 && <Row label="Paid out" value={`-${formatMoney(shift.payOuts)}`} />}
          {shift.discounts > 0 && <Row label="Discounts" value={`-${formatMoney(shift.discounts)}`} />}
          {shift.refunds > 0 && <Row label="Refunds" value={`-${formatMoney(shift.refunds)}`} />}
          <Row
            label={`${shift.salesCount} sale${shift.salesCount !== 1 ? 's' : ''} · gross`}
            value={formatMoney(shift.gross)}
          />
          {/* More than one name: someone joined this till. The drawer is
              still one count, but whose sales are in it is worth knowing
              when it doesn't balance. */}
          {(shift.byUser?.length ?? 0) > 1 &&
            shift.byUser.map((u) => (
              <Row
                key={u.userId ?? 'unknown'}
                label={`\u00a0\u00a0${u.name} (${u.count})`}
                value={formatMoney(u.amount)}
              />
            ))}
          {blind ? (
            <div className="!mt-2 flex items-start gap-2 border-t border-border pt-1.5 text-xs text-muted-foreground">
              <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Count what is in the drawer. The expected amount is hidden; your manager
                sees any difference.
              </span>
            </div>
          ) : (
            <div className="!mt-2 flex justify-between border-t border-border pt-1.5 font-medium text-foreground">
              <Hint tip="What should be in the drawer: opening float + cash sales + credit collected in cash + paid in − paid out − cash refunds.">
                Expected cash
              </Hint>
              <span>{formatMoney(shift.expectedCash)}</span>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-medium">Cash counted</span>
          {denominations && (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setByNotes((v) => !v)}
            >
              {byNotes ? 'Type the total instead' : 'Count by notes'}
            </button>
          )}
        </div>
        {byNotes && denominations ? (
          <div className="mt-2 rounded-lg border border-border p-2">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
              {denominations.map((d) => (
                <label key={d} className="flex items-center gap-2 text-sm">
                  <span className="w-12 shrink-0 text-right text-muted-foreground">
                    {d < 1 ? d.toFixed(2) : d} ×
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    className="h-8"
                    disabled={isPending}
                    value={notes[String(d)] ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [String(d)]: e.target.value }))}
                    placeholder="0"
                    aria-label={`Number of ${d} notes or coins`}
                  />
                </label>
              ))}
            </div>
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-semibold">
              <span>Total</span>
              <span>{formatMoney(counted)}</span>
            </div>
          </div>
        ) : (
          <Input
            type="number"
            step="0.01"
            min="0"
            autoFocus
            className="mt-1.5"
            aria-label="Cash counted"
            disabled={isPending}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="0.00"
          />
        )}

        {hasCounted && !blind && variance !== null && (
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

        <Field label="Leave in drawer for next shift" className="mt-3">
          <Input
            type="number"
            step="0.01"
            min="0"
            disabled={isPending}
            value={left}
            onChange={(e) => setLeft(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        {hasCounted && cashLeft !== undefined && (
          <p className={cn('mt-1 text-xs', leftTooMuch ? 'text-destructive' : 'text-muted-foreground')}>
            {leftTooMuch
              ? 'That is more than the cash counted.'
              : `Take out ${formatMoney(round2(counted - cashLeft))} — the next shift opens with ${formatMoney(cashLeft)}.`}
          </p>
        )}

        <Field
          label={noteRequired ? 'Why is the drawer off? (required)' : 'Note (optional)'}
          className="mt-3"
        >
          <Input
            disabled={isPending}
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            placeholder={noteRequired ? 'e.g. gave wrong change to a customer' : 'e.g. recounted twice'}
          />
        </Field>

        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" disabled={isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={!canClose} loading={isPending} onClick={confirm}>
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
