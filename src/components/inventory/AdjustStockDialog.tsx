'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { InventoryApi } from '@/api';
import type { StockItem } from '@/types';
import { SerialPicker } from '@/components/SerialPicker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';

/**
 * Add or remove stock by hand, with a reason. Mounted per item, so each
 * opening starts from a blank change.
 */
export function AdjustStockDialog({
  item: adjusting,
  multiStore,
  onClose,
}: {
  item: StockItem;
  multiStore: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { show } = useToast();
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState('COUNT_CORRECTION');
  const [note, setNote] = useState('');
  // Serialised products: the units added or removed by this adjustment.
  const [adjustSerials, setAdjustSerials] = useState<string[]>([]);

  // A serialised product names its units: whole numbers only, one serial each.
  const serialAdjust = !!adjusting.product.trackSerials;
  const adjustReady =
    delta !== 0 &&
    (!serialAdjust || (Number.isInteger(delta) && adjustSerials.length === Math.abs(delta)));

  const adjust = useMutation({
    mutationFn: () =>
      InventoryApi.adjust({
        storeId: adjusting.storeId,
        productId: adjusting.productId,
        delta,
        reason,
        note: note || undefined,
        ...(serialAdjust ? { serials: adjustSerials } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      qc.invalidateQueries({ queryKey: ['serials'] });
      show('Stock adjusted');
      onClose();
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  return (
    <Dialog open onClose={onClose} title="Adjust stock"
      description={adjusting.product.name}>
      <form onSubmit={(e) => { e.preventDefault(); adjust.mutate(); }} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Current quantity: <span className="font-medium text-foreground">{adjusting.quantity}</span>
          {multiStore && adjusting.store && <> · {adjusting.store.name}</>}
        </p>
        <Field label="Change (use negative to remove)">
          <Input type="number" value={delta} autoFocus
            onChange={(e) => {
              const next = Number(e.target.value);
              // Adding and removing name different units; start over on a sign change.
              if (Math.sign(next) !== Math.sign(delta)) setAdjustSerials([]);
              else setAdjustSerials((sr) => sr.slice(0, Math.abs(next)));
              setDelta(next);
            }} />
        </Field>
        <Field label="Reason">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="COUNT_CORRECTION">Count correction</option>
            <option value="DAMAGE">Damage</option>
            <option value="THEFT">Theft / loss</option>
            <option value="EXPIRED">Expired</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
        {serialAdjust && delta !== 0 && (
          <Field label={delta > 0 ? `Serial numbers of the ${delta} unit(s) added` : `Which ${-delta} unit(s) are leaving?`}>
            <SerialPicker
              key={delta > 0 ? 'in' : 'out'}
              storeId={adjusting.storeId}
              productId={adjusting.productId}
              mode={delta > 0 ? 'enter' : 'pick'}
              max={Math.abs(delta)}
              value={adjustSerials}
              onChange={setAdjustSerials}
            />
            {delta < 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {reason === 'DAMAGE' || reason === 'EXPIRED'
                  ? 'They’ll be marked Damaged in the serial register.'
                  : 'They’ll be marked Lost in the serial register.'}
              </p>
            )}
          </Field>
        )}
        {serialAdjust && !Number.isInteger(delta) && (
          <p className="text-xs text-destructive">This product is counted in whole units.</p>
        )}
        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={adjust.isPending} disabled={!adjustReady}>Apply</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
