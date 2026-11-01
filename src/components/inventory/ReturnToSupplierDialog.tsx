'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PurchasesApi } from '@/api';
import type { Batch } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Spinner } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';

/**
 * Send expired or soon-to-expire stock back to the supplier, from the stock
 * itself. A return goes against the purchase the goods came on -- that is
 * what reduces what is owed, or records what the supplier owes back -- so
 * this finds the deliveries this batch could have come on and returns
 * against the one picked, through the same return as the Purchases page.
 */
export function ReturnToSupplierDialog({ row, onClose }: { row: Batch; onClose: () => void }) {
  const qc = useQueryClient();
  const { show } = useToast();
  const storeId = row.storeId ?? row.store!.id;
  const productId = row.productId ?? row.product.id;
  const lines = useQuery({
    queryKey: ['returnable', storeId, productId, row.id],
    queryFn: () =>
      PurchasesApi.returnable({
        storeId,
        productId,
        batchId: row.source === 'product' ? undefined : row.id,
      }),
  });
  const [picked, setPicked] = useState<string | null>(null);
  const line = lines.data?.find((l) => l.purchaseItemId === picked) ?? lines.data?.[0];
  const onShelf = Number(row.quantity);
  const max = line ? Math.min(line.returnable, onShelf) : 0;
  const [qty, setQty] = useState<string | null>(null);
  const quantity = qty === null ? max : Number(qty);
  const [note, setNote] = useState(row.expired ? 'Expired stock' : 'Expiring stock');

  const send = useMutation({
    mutationFn: () =>
      PurchasesApi.return(line!.purchaseId, {
        note: note.trim() || undefined,
        items: [{ purchaseItemId: line!.purchaseItemId, quantity }],
      }),
    onSuccess: (res) => {
      show(
        res.refundDueFromSupplier > 0
          ? `Returned — ${line!.supplier?.name ?? 'the supplier'} owes ${formatMoney(res.refundDueFromSupplier)} back`
          : `Returned — ${formatMoney(res.returnedValue)} off what you owe`,
      );
      qc.invalidateQueries({ queryKey: ['expiring'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['credit'] });
      onClose();
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Return to supplier"
      description={`${row.product.name}${row.batchNumber ? `, batch ${row.batchNumber}` : ''} — ${onShelf} on the shelf, ${row.expired ? 'expired' : 'expiring'} ${formatDate(row.expiryDate)}.`}
    >
      {lines.isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : !lines.data?.length ? (
        <p className="text-sm text-muted-foreground">
          No received purchase of this {row.source === 'product' ? 'product' : 'batch'} at this store still has
          anything left to return. Write it off instead, or record the return with the supplier by hand.
        </p>
      ) : (
        <div className="space-y-3">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Delivery it came on</legend>
            {lines.data.map((l) => (
              <label key={l.purchaseItemId} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-2.5 text-sm has-[:checked]:border-primary">
                <input
                  type="radio"
                  name="purchase-line"
                  checked={line?.purchaseItemId === l.purchaseItemId}
                  onChange={() => {
                    setPicked(l.purchaseItemId);
                    setQty(null);
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{l.supplier?.name ?? 'No supplier'}{l.reference ? ` · ${l.reference}` : ''}</span>
                  <span className="block text-xs text-muted-foreground">
                    Received {formatDate(l.receivedAt)} · {l.returnable} returnable at {formatMoney(l.costPrice)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <Field label={`Quantity (up to ${max})`}>
            <Input
              type="number"
              min="0"
              step="0.001"
              max={max}
              value={qty ?? String(max)}
              onChange={(e) => setQty(e.target.value)}
            />
          </Field>
          <Field label="Note">
            <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {line && quantity > 0 && quantity <= max && (
            <p className="text-sm text-muted-foreground">
              Takes {quantity} off the shelf and {formatMoney(line.costPrice * quantity)} (plus its VAT) off this purchase.
            </p>
          )}
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          disabled={!line || !(quantity > 0) || quantity > max}
          loading={send.isPending}
          onClick={() => send.mutate()}
        >
          Return {line && quantity > 0 ? quantity : ''}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
