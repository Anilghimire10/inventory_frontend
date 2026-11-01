'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Tag, Trash2, Undo2 } from 'lucide-react';
import { InventoryApi } from '@/api';
import type { Batch } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { daysToExpiry } from '@/lib/expiry';
import { formatDate, formatMoney } from '@/lib/format';
import { useAuth } from '@/auth/AuthContext';
import { can } from '@/lib/permissions';
import { MarkDownDialog } from '@/components/inventory/MarkDownDialog';
import { ReturnToSupplierDialog } from '@/components/inventory/ReturnToSupplierDialog';

/**
 * Stock → Expiring: what has already expired (to take off the shelf) apart
 * from what expires in the next 30 days (to sell first or discount). Expired
 * rows can be written off in one step -- an EXPIRED adjustment that also
 * empties the batch, so it leaves this list. Stock still in date can be
 * marked down to sell in time, and either can go back to the supplier.
 */
export function ExpiringTab({
  rows,
  showStore,
  onOpenProduct,
}: {
  rows: Batch[];
  showStore: boolean;
  /** A row click: that product's details at that row's store. */
  onOpenProduct?: (productId: string, storeId?: string) => void;
}) {
  const qc = useQueryClient();
  const { show } = useToast();
  const { user } = useAuth();
  const role = user?.role ?? 'CASHIER';
  const [target, setTarget] = useState<Batch | null>(null);
  const [markDown, setMarkDown] = useState<Batch | null>(null);
  const [sendBack, setSendBack] = useState<Batch | null>(null);
  const expired = rows.filter((r) => r.expired);
  const soon = rows.filter((r) => !r.expired);

  const writeOff = useMutation({
    mutationFn: (b: Batch) =>
      InventoryApi.writeOffExpired({
        storeId: b.storeId ?? b.store!.id,
        productId: b.productId ?? b.product.id,
        batchId: b.source === 'product' ? undefined : b.id,
      }),
    onSuccess: (res, b) => {
      show(`Wrote off ${res.writtenOff} of ${b.product.name}`);
      setTarget(null);
      qc.invalidateQueries({ queryKey: ['expiring'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const table = (list: Batch[], isExpired: boolean) => (
    <Table>
      <THead>
        <TR>
          <TH>Product</TH>
          {showStore && <TH>Store</TH>}
          <TH>Batch</TH>
          <TH>{isExpired ? 'Expired' : 'Expires'}</TH>
          <TH className="text-right">Qty</TH>
          <TH />
        </TR>
      </THead>
      <TBody>
        {list.map((b) => {
          const days = b.expiryDate ? daysToExpiry(b.expiryDate) : null;
          return (
            <TR key={b.id} onOpen={onOpenProduct && (() => onOpenProduct(b.productId ?? b.product.id, b.storeId ?? b.store?.id))}>
              <TD className="font-medium">{b.product.name}</TD>
              {showStore && <TD className="text-muted-foreground">{b.store?.name ?? '—'}</TD>}
              <TD className="text-muted-foreground">
                {b.source === 'product' ? <span className="italic">Product date</span> : b.batchNumber || '—'}
              </TD>
              <TD>
                <Badge tone={isExpired ? 'destructive' : days != null && days <= 7 ? 'warning' : 'muted'}>
                  {formatDate(b.expiryDate)}
                </Badge>
                {!isExpired && days != null && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}
                  </span>
                )}
              </TD>
              <TD className="text-right">
                {b.quantity}
                {!isExpired && b.clearancePrice != null && (
                  <span className="mt-0.5 block text-xs font-medium text-success">
                    Clearance {formatMoney(b.clearancePrice)}
                  </span>
                )}
              </TD>
              <TD className="text-right">
                <div className="flex justify-end gap-2">
                  {!isExpired && can.markDown(role) && (
                    <Button size="sm" variant="outline" onClick={() => setMarkDown(b)}>
                      <Tag className="h-4 w-4" /> {b.clearancePrice != null ? 'Markdown' : 'Mark down'}
                    </Button>
                  )}
                  {can.returnToSupplier(role) && (
                    <Button size="sm" variant="outline" onClick={() => setSendBack(b)}>
                      <Undo2 className="h-4 w-4" /> Return to supplier
                    </Button>
                  )}
                  {isExpired && (
                    <Button size="sm" variant="outline" onClick={() => setTarget(b)}>
                      <Trash2 className="h-4 w-4" /> Write off
                    </Button>
                  )}
                </div>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      {expired.length > 0 && (
        <section>
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" /> Expired ({expired.length})
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Past their date. Take them off the shelf and write them off so they stop counting as stock.
          </p>
          {table(expired, true)}
        </section>
      )}
      {soon.length > 0 && (
        <section>
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="h-4 w-4 text-warning" /> Expiring in the next 30 days ({soon.length})
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Sell these first — the till already takes the soonest-expiring batch. Mark them down to move them faster,
            or send them back to the supplier while they are still in date.
          </p>
          {table(soon, false)}
        </section>
      )}
      <ConfirmDialog
        open={!!target}
        title="Write off expired stock?"
        description={
          target
            ? `${target.quantity} of ${target.product.name}${
                target.batchNumber ? ` (batch ${target.batchNumber})` : ''
              } will be removed from stock as Expired. This is recorded in stock movements.`
            : undefined
        }
        confirmLabel="Write off"
        destructive
        loading={writeOff.isPending}
        onConfirm={() => target && writeOff.mutate(target)}
        onCancel={() => setTarget(null)}
      />
      {markDown && <MarkDownDialog row={markDown} onClose={() => setMarkDown(null)} />}
      {sendBack && <ReturnToSupplierDialog row={sendBack} onClose={() => setSendBack(null)} />}
    </div>
  );
}
