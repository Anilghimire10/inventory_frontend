'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { InventoryApi, ProductsApi } from '@/api';
import type { Product, Store } from '@/types';
import { SearchPicker } from '@/components/SearchPicker';
import { SerialPicker } from '@/components/SerialPicker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { apiError } from '@/lib/api';

/**
 * Move stock between two stores. Mounted when opened, so it starts from the
 * first two stores and no lines each time.
 */
export function TransferDialog({ stores, onClose }: { stores: Store[] | undefined; onClose: () => void }) {
  const qc = useQueryClient();
  const { show } = useToast();
  const [fromStoreId, setFromStoreId] = useState(stores?.[0]?.id ?? '');
  const [toStoreId, setToStoreId] = useState(stores?.[1]?.id ?? '');
  const [transferNote, setTransferNote] = useState('');
  const [transferLines, setTransferLines] = useState<
    { productId: string; name: string; quantity: number; trackSerials?: boolean; serials?: string[]; pickUnits?: boolean }[]
  >([]);

  const transfer = useMutation({
    mutationFn: () =>
      InventoryApi.transfer({
        fromStoreId,
        toStoreId,
        note: transferNote || undefined,
        items: transferLines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          // Chosen units, or none: the oldest on file go.
          ...(l.pickUnits && l.serials?.length ? { serials: l.serials } : {}),
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      qc.invalidateQueries({ queryKey: ['serials'] });
      show('Stock transferred');
      onClose();
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const addTransferLine = (product: Product | null) => {
    if (!product || transferLines.some((l) => l.productId === product.id)) return;
    setTransferLines((ls) => [
      ...ls,
      { productId: product.id, name: product.name, quantity: 1, trackSerials: product.trackSerials },
    ]);
  };
  const updateTransferLine = (i: number, quantity: number) =>
    setTransferLines((ls) =>
      ls.map((l, idx) => (idx === i ? { ...l, quantity, serials: l.serials?.slice(0, quantity) } : l)),
    );
  const setTransferSerials = (i: number, changes: { serials?: string[]; pickUnits?: boolean }) =>
    setTransferLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...changes } : l)));
  const removeTransferLine = (i: number) =>
    setTransferLines((ls) => ls.filter((_, idx) => idx !== i));

  const sameStore = !!fromStoreId && fromStoreId === toStoreId;
  const canTransfer =
    !!fromStoreId &&
    !!toStoreId &&
    !sameStore &&
    transferLines.length > 0 &&
    transferLines.every((l) => l.quantity > 0) &&
    // Serialised: whole units, and if units are being chosen, all of them.
    transferLines.every(
      (l) =>
        !l.trackSerials ||
        (Number.isInteger(l.quantity) && (!l.pickUnits || (l.serials?.length ?? 0) === l.quantity)),
    );

  return (
    <Dialog open onClose={onClose} title="Transfer stock"
      description="Move stock from one store to another." className="max-w-2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="From store">
            <Select value={fromStoreId} onChange={(e) => setFromStoreId(e.target.value)}>
              {stores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="To store">
            <Select value={toStoreId} onChange={(e) => setToStoreId(e.target.value)}>
              {stores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        </div>
        {sameStore && (
          <p className="text-xs text-destructive">Source and destination stores must differ.</p>
        )}

        <Field label="Add product">
          {/* Scoped to the source store: only what it carries can leave it. */}
          <SearchPicker<Product>
            queryKey={['products', 'pick', 'transfer', fromStoreId]}
            fetchPage={(search, limit) =>
              ProductsApi.list({ search: search || undefined, limit, storeId: fromStoreId || undefined })
            }
            label={(p) => p.name}
            detail={(p) => (p.onHandQty != null ? `${Number(p.onHandQty)} ${p.unit} on hand` : p.sku)}
            isTaken={(p) => transferLines.some((l) => l.productId === p.id)}
            onPick={addTransferLine}
            placeholder="Search by name, SKU or barcode…"
            aria-label="Add product"
          />
        </Field>

        {transferLines.length > 0 && (
          <div className="space-y-2">
            {transferLines.map((l, i) => (
              <div key={l.productId} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center gap-3">
                  <span className="flex-1 font-medium">{l.name}</span>
                  <Input type="number" step={l.trackSerials ? 1 : 0.001} min={l.trackSerials ? 1 : 0.001} className="w-28"
                    value={l.quantity}
                    onChange={(e) => updateTransferLine(i, Number(e.target.value))} />
                  <Tooltip content="Remove line">
                    <Button size="icon" variant="ghost" onClick={() => removeTransferLine(i)}
                      aria-label={`Remove ${l.name}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </Tooltip>
                </div>
                {l.trackSerials && (
                  <div className="space-y-2 text-sm">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" className="h-4 w-4" checked={!!l.pickUnits}
                        onChange={(e) => setTransferSerials(i, { pickUnits: e.target.checked, serials: [] })} />
                      Choose which units are moving (otherwise the oldest on file go)
                    </label>
                    {l.pickUnits && fromStoreId && (
                      <SerialPicker
                        key={fromStoreId}
                        storeId={fromStoreId}
                        productId={l.productId}
                        max={l.quantity}
                        value={l.serials ?? []}
                        onChange={(serials) => setTransferSerials(i, { serials })}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <Field label="Note (optional)">
          <Input value={transferNote} onChange={(e) => setTransferNote(e.target.value)} />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button loading={transfer.isPending} disabled={!canTransfer} onClick={() => transfer.mutate()}>
          Transfer {transferLines.length} item{transferLines.length !== 1 ? 's' : ''}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
