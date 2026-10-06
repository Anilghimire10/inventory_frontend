'use client';
import { SlidersHorizontal, Target } from 'lucide-react';
import type { StockItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';

/** Stock levels, one row per product and store, with its two actions. */
export function StockTable({
  items,
  onAdjust,
  onReorderLevel,
  onOpen,
  lowMode,
  showStore,
}: {
  items: StockItem[];
  onAdjust: (i: StockItem) => void;
  onReorderLevel: (i: StockItem) => void;
  /** A row click: the product's details at that store. */
  onOpen?: (i: StockItem) => void;
  lowMode?: boolean;
  /** Viewing every branch at once — without this the same product appears
   *  once per store with nothing to tell the rows apart. */
  showStore?: boolean;
}) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Product</TH>
          {showStore && <TH>Store</TH>}
          {/* Phones: product, quantity and the actions; SKU and level ride along under the name. */}
          <TH className="hidden sm:table-cell">SKU</TH>
          <TH className="text-right">Qty</TH>
          <TH className="hidden text-right sm:table-cell">Reorder at</TH>
          <TH></TH>
        </TR>
      </THead>
      <TBody>
        {items.map((it) => {
          const reorder =
            it.effectiveReorderLevel ?? (it.reorderLevel || it.product.reorderLevel || 0);
          const lowFlag = reorder > 0 && Number(it.quantity) <= reorder;
          return (
            <TR key={it.id} onOpen={onOpen && (() => onOpen(it))}>
              <TD className="font-medium">
                {it.product.name}
                <span className="block text-xs font-normal text-muted-foreground sm:hidden">
                  {[it.product.sku, reorder ? `reorder at ${reorder}` : null].filter(Boolean).join(' · ')}
                </span>
              </TD>
              {showStore && (
                <TD className="text-muted-foreground">{it.store?.name ?? '—'}</TD>
              )}
              <TD className="hidden text-muted-foreground sm:table-cell">{it.product.sku || '—'}</TD>
              <TD className="text-right">
                <span className={cn('font-semibold', (lowMode || lowFlag) && 'text-warning')}>
                  {it.quantity}
                </span>
              </TD>
              <TD className="hidden text-right text-muted-foreground sm:table-cell">{reorder || '—'}</TD>
              <TD className="text-right">
                <div className="flex justify-end gap-1 sm:gap-2">
                  <Tooltip content="Set this store's reorder level">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onReorderLevel(it)}
                    >
                      <Target className="h-3.5 w-3.5" />
                    <span className="sr-only sm:not-sr-only">Reorder level</span>
                    </Button>
                  </Tooltip>
                  <Button size="sm" variant="outline" onClick={() => onAdjust(it)}>
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span className="sr-only sm:not-sr-only">Adjust</span>
                  </Button>
                </div>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
