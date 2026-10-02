'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { InventoryApi } from '@/api';
import type { StockItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';

/**
 * One store's reorder level for one product. 0 clears the per-store override
 * and falls back to the product default.
 */
export function ReorderLevelDialog({ item: reorderTarget, onClose }: { item: StockItem; onClose: () => void }) {
  const qc = useQueryClient();
  const { show } = useToast();
  const [reorderLevelInput, setReorderLevelInput] = useState(reorderTarget.reorderLevel || 0);

  const saveReorderLevel = useMutation({
    mutationFn: () =>
      InventoryApi.setReorderLevel({
        storeId: reorderTarget.storeId,
        productId: reorderTarget.productId,
        reorderLevel: reorderLevelInput,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
      qc.invalidateQueries({ queryKey: ['reorder-suggestions'] });
      show('Reorder level updated');
      onClose();
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Reorder level"
      description={
        `${reorderTarget.product.name} at ${reorderTarget.store?.name ?? 'this store'}`
      }
    >
      <Field label="Reorder at">
        <Input
          type="number"
          min="0"
          step="1"
          value={reorderLevelInput}
          onChange={(e) =>
            setReorderLevelInput(Math.max(0, Math.floor(Number(e.target.value) || 0)))
          }
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {reorderTarget.product.reorderLevel
            ? `Leave 0 to fall back to the product default of ${reorderTarget.product.reorderLevel}.`
            : 'Leave 0 for no alert — this product has no default set.'}
        </p>
      </Field>
      <p className="mt-3 text-sm text-muted-foreground">
        Stock at or below this triggers the low-stock alert and a reorder suggestion
        for this store only.
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button loading={saveReorderLevel.isPending} onClick={() => saveReorderLevel.mutate()}>
          Save
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
