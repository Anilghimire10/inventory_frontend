'use client';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CustomersApi } from '@/api';
import type { Customer, CustomerStatement } from '@/types';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LoadingBlock, ErrorState } from '@/components/ui/misc';
import { formatDate, formatMoney } from '@/lib/format';

interface Line {
  key: string;
  date: string | null;
  label: string;
  detail?: string;
  /** Positive puts money on the khata, negative takes it off. */
  amount: number;
  balance: number;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  MOBILE: 'Mobile / QR',
  MIXED: 'Mixed',
  CREDIT: 'Credit',
};

/**
 * Charges and payments in date order with a running balance. Only credit
 * payments move the khata; what a customer paid up front at checkout never
 * went on it, so those rows are left out rather than shown as reductions.
 */
function toLines(s: CustomerStatement): Line[] {
  const events = [
    ...s.charges.map((c) => ({
      key: `c-${c.saleId}`,
      date: c.createdAt,
      label: `Credit sale ${c.receiptNo}`,
      amount: c.amount,
    })),
    ...s.payments
      .filter((p) => p.type === 'CUSTOMER_CREDIT')
      .map((p) => ({
        key: `p-${p.id}`,
        date: p.createdAt,
        label: 'Payment received',
        detail: [METHOD_LABELS[p.method] ?? p.method, p.user?.name, p.note].filter(Boolean).join(' · '),
        amount: -p.amount,
      })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let balance = s.openingBalance;
  const lines: Line[] = [];
  if (Math.abs(s.openingBalance) >= 0.01) {
    lines.push({
      key: 'opening',
      date: null,
      label: 'Opening balance',
      detail: 'Owed before sales and payments were recorded here',
      amount: s.openingBalance,
      balance,
    });
  }
  for (const e of events) {
    balance = Math.round((balance + e.amount) * 100) / 100;
    lines.push({ ...e, balance });
  }
  return lines;
}

export function CustomerStatementDialog({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers', 'statement', customer.id],
    queryFn: () => CustomersApi.statement(customer.id),
  });
  const lines = useMemo(() => (data ? toLines(data) : []), [data]);

  return (
    <Dialog open onClose={onClose} title="Account statement" description={customer.name}>
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <Tile label="Charged" value={formatMoney(data.totals.charged)} />
            <Tile label="Paid" value={formatMoney(data.totals.paid)} />
            <Tile label="Owes now" value={formatMoney(data.totals.closing)} strong />
          </div>

          {lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No credit sales or payments on this account.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Entry</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((l) => (
                    <tr key={l.key}>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {l.date ? formatDate(l.date) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {l.label}
                        {l.detail && <div className="text-xs text-muted-foreground">{l.detail}</div>}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2 text-right ${l.amount < 0 ? 'text-success' : ''}`}
                      >
                        {l.amount < 0 ? `−${formatMoney(-l.amount)}` : formatMoney(l.amount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                        {formatMoney(l.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!data.reconciles && (
            <p className="text-xs text-muted-foreground">
              The opening balance is credit this account carried before sales and payments were
              recorded here. It is included in what they owe.
            </p>
          )}
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function Tile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={strong ? 'font-semibold' : 'font-medium'}>{value}</div>
    </div>
  );
}
