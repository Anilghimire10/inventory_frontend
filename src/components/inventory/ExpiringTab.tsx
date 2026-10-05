'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Trash2 } from 'lucide-react';
import { InventoryApi } from '@/api';
import type { Batch } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { daysToExpiry } from '@/lib/expiry';
import { formatDate } from '@/lib/format';

/**
 * Stock → Expiring: what has already expired (to take off the shelf) apart
 * from what expires in the next 30 days (to sell first or discount). Expired
 * rows can be written off in one step -- an EXPIRED adjustment that also
 * empties the batch, so it leaves this list.
 */
export function ExpiringTab({ rows, showStore }: { rows: Batch[]; showStore: boolean }) {
  const qc = useQueryClient();
  const { show } = useToast();
  const [target, setTarget] = useState<Batch | null>(null);
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
          {isExpired && <TH />}
        </TR>
      </THead>
      <TBody>
        {list.map((b) => {
          const days = b.expiryDate ? daysToExpiry(b.expiryDate) : null;
          return (
            <TR key={b.id}>
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
              <TD className="text-right">{b.quantity}</TD>
              {isExpired && (
                <TD className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setTarget(b)}>
                    <Trash2 className="h-4 w-4" /> Write off
                  </Button>
                </TD>
              )}
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
          <p className="mb-3 text-xs text-muted-foreground">Sell these first. The till already takes the oldest batch.</p>
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
    </div>
  );
}
