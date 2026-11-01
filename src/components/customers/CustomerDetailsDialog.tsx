'use client';
import { useQuery } from '@tanstack/react-query';
import { Mail, MapPin, Phone } from 'lucide-react';
import { CustomersApi } from '@/api';
import type { CustomerDetails, SaleStatus } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ErrorState, LoadingBlock } from '@/components/ui/misc';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUS: Record<SaleStatus, { label: string; tone: 'success' | 'warning' | 'destructive' | 'muted' }> = {
  COMPLETED: { label: 'Completed', tone: 'success' },
  PARTIALLY_RETURNED: { label: 'Part return', tone: 'warning' },
  RETURNED: { label: 'Returned', tone: 'destructive' },
  HELD: { label: 'Held', tone: 'muted' },
};

/**
 * A customer at a glance: how to reach them, what they have bought, what they
 * still owe on credit and their latest sales. Staff pinned to a store see that
 * store's figures, the same scope as the customer list.
 */
export function CustomerDetailsDialog({
  customerId,
  onClose,
  actions,
}: {
  customerId: string;
  onClose: () => void;
  /** Footer buttons, given the loaded customer (Statement, Record payment, Edit). */
  actions?: (c: CustomerDetails) => React.ReactNode;
}) {
  const { data: c, isError, refetch } = useQuery({
    queryKey: ['customers', 'detail', customerId],
    queryFn: () => CustomersApi.get(customerId),
  });
  const due = Number(c?.creditBalance ?? 0);

  return (
    <Dialog open onClose={onClose} title={c?.name ?? 'Customer'} className="max-w-2xl">
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !c ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-5">
          {(c.phone || c.email || c.address) && (
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              {c.phone && (
                <Contact icon={Phone}>
                  <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a>
                </Contact>
              )}
              {c.email && (
                <Contact icon={Mail}>
                  <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>
                </Contact>
              )}
              {c.address && <Contact icon={MapPin}>{c.address}</Contact>}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-md border border-border p-4 text-sm sm:grid-cols-4">
            <Stat label="Purchases" value={String(c.summary.purchases)} />
            <Stat label="Spent in total" value={formatMoney(c.summary.totalSpent)} />
            <Stat
              label="Credit due"
              value={formatMoney(due)}
              tone={due > 0 ? 'text-destructive' : undefined}
            />
            <Stat
              label="Last purchase"
              value={c.summary.lastPurchaseAt ? formatDate(c.summary.lastPurchaseAt) : '—'}
            />
          </dl>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent sales
            </h3>
            {c.sales.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales for this customer yet.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Receipt</TH>
                    <TH className="hidden sm:table-cell">Store</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Total</TH>
                  </TR>
                </THead>
                <TBody>
                  {c.sales.map((s) => (
                    <TR key={s.id}>
                      <TD className="whitespace-nowrap text-muted-foreground">{formatDate(s.createdAt)}</TD>
                      <TD className="font-medium">{s.receiptNo}</TD>
                      <TD className="hidden text-muted-foreground sm:table-cell">{s.store?.name ?? '—'}</TD>
                      <TD>
                        <Badge tone={s.paymentMethod === 'CREDIT' && s.status === 'COMPLETED' ? 'warning' : STATUS[s.status].tone}>
                          {s.paymentMethod === 'CREDIT' && s.status === 'COMPLETED' ? 'On credit' : STATUS[s.status].label}
                        </Badge>
                      </TD>
                      <TD className="text-right font-medium">{formatMoney(s.total)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            {c.summary.purchases > c.sales.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                The latest {c.sales.length} of {c.summary.purchases}; all of them are on Sales.
              </p>
            )}
          </section>
        </div>
      )}
      <DialogFooter>
        {c && actions?.(c)}
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function Contact({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('truncate font-semibold', tone)}>{value}</dd>
    </div>
  );
}
