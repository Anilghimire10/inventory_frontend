'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Mail, MapPin, Phone, User } from 'lucide-react';
import { SuppliersApi } from '@/api';
import type { SupplierDetails } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ErrorState, LoadingBlock } from '@/components/ui/misc';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PurchasePaymentBadge } from '@/components/purchases/PurchaseDetailsDialog';

/**
 * A supplier at a glance: how to reach them, how much the shop has bought
 * from them, what it still owes (the same figure as Credit → Payables) and
 * their latest purchases, each of which opens its own details.
 */
export function SupplierDetailsDialog({
  supplierId,
  onOpenPurchase,
  onClose,
  onBack,
  actions,
}: {
  supplierId: string;
  onOpenPurchase: (purchaseId: string) => void;
  onClose: () => void;
  /** Back to where it was opened from, when that was a dialog too. */
  onBack?: () => void;
  /** Footer buttons, given the loaded supplier (Edit). */
  actions?: (s: SupplierDetails) => React.ReactNode;
}) {
  const { data: s, isError, refetch } = useQuery({
    queryKey: ['suppliers', 'detail', supplierId],
    queryFn: () => SuppliersApi.get(supplierId),
  });

  return (
    <Dialog open onClose={onClose} title={s?.name ?? 'Supplier'} className="max-w-2xl">
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !s ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-5">
          {(s.contactName || s.phone || s.email || s.address) && (
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              {s.contactName && <Contact icon={User}>{s.contactName}</Contact>}
              {s.phone && (
                <Contact icon={Phone}>
                  <a href={`tel:${s.phone}`} className="hover:underline">{s.phone}</a>
                </Contact>
              )}
              {s.email && (
                <Contact icon={Mail}>
                  <a href={`mailto:${s.email}`} className="hover:underline">{s.email}</a>
                </Contact>
              )}
              {s.address && <Contact icon={MapPin}>{s.address}</Contact>}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-md border border-border p-4 text-sm sm:grid-cols-4">
            <Stat label="Purchases" value={String(s.summary.purchases)} />
            <Stat label="Bought in total" value={formatMoney(s.summary.totalPurchased)} />
            <Stat
              label="You owe them"
              value={formatMoney(s.summary.outstanding)}
              tone={s.summary.outstanding > 0 ? 'text-destructive' : undefined}
            />
            {s.summary.refundDue > 0 ? (
              <Stat label="They owe you" value={formatMoney(s.summary.refundDue)} tone="text-warning" />
            ) : (
              <Stat
                label="Last purchase"
                value={s.summary.lastPurchaseAt ? formatDate(s.summary.lastPurchaseAt) : '—'}
              />
            )}
          </dl>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent purchases
            </h3>
            {s.recentPurchases.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing bought from this supplier yet.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Reference</TH>
                    <TH className="hidden sm:table-cell">Status</TH>
                    <TH>Payment</TH>
                    <TH className="text-right">Total</TH>
                  </TR>
                </THead>
                <TBody>
                  {s.recentPurchases.map((p) => (
                    <TR key={p.id} onOpen={() => onOpenPurchase(p.id)}>
                      <TD className="whitespace-nowrap text-muted-foreground">{formatDate(p.createdAt)}</TD>
                      <TD className="font-medium">{p.reference || p.id.slice(-6)}</TD>
                      <TD className="hidden sm:table-cell">
                        <Badge tone={p.status === 'RECEIVED' ? 'success' : 'muted'}>{p.status}</Badge>
                      </TD>
                      <TD>{p.status === 'CANCELLED' ? '—' : <PurchasePaymentBadge purchase={p} />}</TD>
                      <TD className="text-right font-medium">{formatMoney(p.total)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            {s.summary.purchases > s.recentPurchases.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                The latest {s.recentPurchases.length} of {s.summary.purchases}; all of them are on Purchases.
              </p>
            )}
          </section>
        </div>
      )}
      <DialogFooter>
        {onBack && (
          <Button type="button" variant="ghost" className="mr-auto" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        )}
        {s && actions?.(s)}
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
