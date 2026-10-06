'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { PurchasesApi } from '@/api';
import type { Purchase } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ErrorState, LoadingBlock } from '@/components/ui/misc';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { TENDER_LABEL } from '@/lib/payment-methods';

/** Where a purchase stands with the supplier: the badge on Purchases and in its details. */
export function PurchasePaymentBadge({ purchase }: { purchase: Pick<Purchase, 'total' | 'amountPaid' | 'refundDue' | 'outstanding'> }) {
  const outstanding = purchase.outstanding ?? Number(purchase.total) - Number(purchase.amountPaid);
  if (Number(purchase.refundDue ?? 0) > 0) {
    return <Badge tone="warning">Owes you {formatMoney(purchase.refundDue!)}</Badge>;
  }
  if (outstanding <= 0.001) return <Badge tone="success">Paid</Badge>;
  if (Number(purchase.amountPaid) > 0) return <Badge tone="warning">Owing {formatMoney(outstanding)}</Badge>;
  return <Badge tone="destructive">On credit</Badge>;
}

/**
 * One purchase in full: who it came from and where it went, every line with
 * its VAT, batch and expiry, what was sent back, the serial numbers that came
 * in, and each payment to (or refund from) the supplier. Opened by clicking a
 * row on Purchases or in a supplier's details, as a sale opens on Sales.
 */
export function PurchaseDetailsDialog({
  purchaseId,
  onClose,
  onBack,
  actions,
}: {
  purchaseId: string;
  onClose: () => void;
  /** Back to where it was opened from, when that was a dialog too. */
  onBack?: () => void;
  /** Footer buttons, given the loaded purchase (Edit, Receive, Return…). */
  actions?: (p: Purchase) => React.ReactNode;
}) {
  const { data: p, isError, refetch } = useQuery({
    queryKey: ['purchases', 'detail', purchaseId],
    queryFn: () => PurchasesApi.get(purchaseId),
  });
  const lines = p?.items ?? [];
  const serialsOf = (productId: string) => (p?.serials ?? []).filter((s) => s.productId === productId);
  const anyReturned = lines.some((l) => Number(l.returnedQty) > 0);
  const anyBatch = lines.some((l) => l.batchNumber || l.expiryDate);
  const outstanding = p ? (p.outstanding ?? Number(p.total) - Number(p.amountPaid)) : 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title={p ? `Purchase ${p.reference || p.id.slice(-6)}` : 'Purchase'}
      className="max-w-3xl"
    >
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !p ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col items-start justify-between gap-3 rounded-md border border-border p-4 text-sm sm:flex-row">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Supplier</div>
              <div className="font-medium">{p.supplier?.name ?? 'No supplier'}</div>
              {p.store && <div className="text-muted-foreground">Into {p.store.name}</div>}
            </div>
            <div className="text-left sm:text-right">
              <div className="flex flex-wrap gap-1 sm:justify-end">
                <Badge tone={p.status === 'RECEIVED' ? 'success' : 'muted'}>{p.status}</Badge>
                {p.status !== 'CANCELLED' && <PurchasePaymentBadge purchase={p} />}
              </div>
              <div className="mt-1 text-muted-foreground">Recorded {formatDate(p.createdAt)}</div>
              {p.receivedAt && <div className="text-muted-foreground">Received {formatDate(p.receivedAt)}</div>}
            </div>
          </div>

          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH className="text-right">Qty</TH>
                {anyReturned && <TH className="text-right">Returned</TH>}
                <TH className="text-right">Cost</TH>
                <TH className="hidden text-right sm:table-cell">VAT</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {lines.map((l) => {
                const net = Number(l.quantity) * Number(l.costPrice);
                const vat = Number(l.taxRate ?? 0);
                const serials = serialsOf(l.productId);
                return (
                  <TR key={l.id}>
                    <TD>
                      <div className="font-medium">{l.product?.name ?? l.productId}</div>
                      {anyBatch && (l.batchNumber || l.expiryDate) && (
                        <div className="text-xs text-muted-foreground">
                          {[l.batchNumber && `Batch ${l.batchNumber}`, l.expiryDate && `expires ${formatDate(l.expiryDate)}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      )}
                      {serials.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {serials.map((s) => (
                            <span key={s.serialNumber} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                              {s.serialNumber}
                            </span>
                          ))}
                        </div>
                      )}
                    </TD>
                    <TD className="text-right">{l.quantity}</TD>
                    {anyReturned && (
                      <TD className="text-right text-warning">{Number(l.returnedQty) > 0 ? l.returnedQty : '—'}</TD>
                    )}
                    <TD className="text-right">{formatMoney(l.costPrice)}</TD>
                    <TD className="hidden text-right text-muted-foreground sm:table-cell">{vat ? `${vat}%` : '—'}</TD>
                    <TD className="text-right">{formatMoney(net * (1 + vat / 100))}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>

          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-1 text-sm">
              <Row label="Subtotal" value={formatMoney(p.subtotal)} />
              {Number(p.tax) > 0 && <Row label="VAT" value={formatMoney(p.tax)} />}
              <div className="flex justify-between border-t border-border pt-1 text-base font-semibold">
                <span>Total</span>
                <span>{formatMoney(p.total)}</span>
              </div>
              <Row label="Paid" value={formatMoney(p.amountPaid)} />
              {outstanding > 0.001 && p.status !== 'CANCELLED' && (
                <div className="flex justify-between font-medium text-destructive">
                  <span>Still owed</span>
                  <span>{formatMoney(outstanding)}</span>
                </div>
              )}
              {Number(p.refundDue ?? 0) > 0 && (
                <div className="flex justify-between font-medium text-warning">
                  <span>Supplier owes you</span>
                  <span>{formatMoney(p.refundDue!)}</span>
                </div>
              )}
            </div>
          </div>

          {(p.payments?.length ?? 0) > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Payments</h3>
              <Table>
                <THead>
                  <TR>
                    <TH>When</TH>
                    <TH>Method</TH>
                    <TH className="hidden sm:table-cell">By</TH>
                    <TH className="text-right">Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {p.payments!.map((pay) => {
                    const refund = pay.type === 'SUPPLIER_REFUND';
                    return (
                      <TR key={pay.id}>
                        <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(pay.createdAt)}</TD>
                        <TD>
                          {TENDER_LABEL[pay.method] ?? pay.method}
                          {refund && <Badge tone="warning" className="ml-2">Refund</Badge>}
                        </TD>
                        <TD className="hidden text-muted-foreground sm:table-cell">{pay.user?.name ?? '—'}</TD>
                        <TD className={refund ? 'text-right text-success' : 'text-right'}>
                          {refund ? '+ ' : ''}
                          {formatMoney(pay.amount)}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </section>
          )}

          {p.note && (
            <p className="whitespace-pre-line break-words rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
              {p.note}
            </p>
          )}
        </div>
      )}
      <DialogFooter>
        {onBack && (
          <Button type="button" variant="ghost" className="mr-auto" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        )}
        {p && actions?.(p)}
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
