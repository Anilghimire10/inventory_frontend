'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { InventoryApi } from '@/api';
import type { Batch } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';

const QUICK_OFF = [10, 25, 50];

/**
 * Mark stock nearing its date down so it sells before it has to be written
 * off. The till charges the clearance price on units drawn from this stock --
 * it sells soonest-expiry first, so these go before fresher stock -- and on
 * nothing else.
 */
export function MarkDownDialog({ row, onClose }: { row: Batch; onClose: () => void }) {
  const qc = useQueryClient();
  const { show } = useToast();
  const selling = Number(row.product.sellingPrice ?? 0);
  const [price, setPrice] = useState(row.clearancePrice != null ? String(row.clearancePrice) : '');
  const value = Number(price);
  const valid = price.trim() !== '' && value >= 0 && value < selling;

  const save = useMutation({
    mutationFn: (next: number | null) =>
      InventoryApi.setClearance({
        storeId: row.storeId ?? row.store!.id,
        productId: row.productId ?? row.product.id,
        batchId: row.source === 'product' ? undefined : row.id,
        price: next,
      }),
    onSuccess: (_res, next) => {
      show(next === null ? `${row.product.name} is back to full price` : `${row.product.name} marked down to ${formatMoney(next)}`);
      qc.invalidateQueries({ queryKey: ['expiring'] });
      // The till's grid carries the markdown.
      qc.invalidateQueries({ queryKey: ['stock'] });
      onClose();
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Mark down to sell"
      description={`${row.quantity} of ${row.product.name}${row.batchNumber ? ` (batch ${row.batchNumber})` : ''}, expiring ${formatDate(row.expiryDate)}${row.store ? ` at ${row.store.name}` : ''}.`}
    >
      <Field label={`Clearance price (selling price ${formatMoney(selling)})`}>
        <Input
          type="number"
          min="0"
          step="0.01"
          autoFocus
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0.00"
        />
      </Field>
      <div className="mt-2 flex flex-wrap gap-2">
        {QUICK_OFF.map((pct) => (
          <Button
            key={pct}
            size="sm"
            variant="outline"
            onClick={() => setPrice(String(Math.round(selling * (100 - pct)) / 100))}
          >
            {pct}% off
          </Button>
        ))}
      </div>
      {price.trim() !== '' && !valid && (
        <p className="mt-2 text-xs text-destructive">A clearance price must be below the selling price.</p>
      )}
      <p className="mt-3 text-sm text-muted-foreground">
        Only these units are charged the clearance price, and only while they are in date.
        Fresh stock of the same product stays at full price.
      </p>
      <DialogFooter>
        {row.clearancePrice != null && (
          <Button variant="outline" className="mr-auto" loading={save.isPending && save.variables === null} onClick={() => save.mutate(null)}>
            End markdown
          </Button>
        )}
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={!valid} loading={save.isPending && save.variables !== null} onClick={() => save.mutate(value)}>
          Mark down
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
