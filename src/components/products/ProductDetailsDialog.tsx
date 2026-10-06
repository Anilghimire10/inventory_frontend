'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Package } from 'lucide-react';
import { InventoryApi, ProductsApi } from '@/api';
import { useStores } from '@/hooks/useStores';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ErrorState, LoadingBlock } from '@/components/ui/misc';
import { RxBadge } from '@/components/ui/RxBadge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/** How many recent stock changes the dialog shows; the full log is Stock → History. */
const RECENT = 8;

/**
 * Everything about one product in one place: prices, codes, where it is
 * stocked and how much, its variants, and its latest stock changes. Opened
 * by clicking a row on Products, Stock or a category's product list, the way
 * a sale opens on Sales.
 *
 * `storeId` is the branch the row was about (a stock row is one product at
 * one store): that store is highlighted and the history narrowed to it.
 */
export function ProductDetailsDialog({
  productId,
  storeId,
  onClose,
  onBack,
  actions,
}: {
  productId: string;
  storeId?: string;
  onClose: () => void;
  /** Back to where it was opened from (a category's list), when that was a dialog too. */
  onBack?: () => void;
  /** Buttons for the footer, e.g. Edit on Products, Adjust on Stock. */
  actions?: React.ReactNode;
}) {
  const product = useQuery({
    queryKey: ['product', productId],
    queryFn: () => ProductsApi.get(productId),
  });
  const movements = useQuery({
    queryKey: ['movements', 'product', productId, storeId ?? ''],
    queryFn: () => InventoryApi.movements({ productId, storeId, page: 1, limit: RECENT }),
  });
  const { data: stores } = useStores();
  const multiStore = (stores?.length ?? 0) > 1;
  const storeName = (id: string) => stores?.find((s) => s.id === id)?.name ?? '—';

  const p = product.data;
  const cost = Number(p?.costPrice ?? 0);
  const price = Number(p?.sellingPrice ?? 0);
  const margin = price > 0 ? ((price - cost) / price) * 100 : null;
  const stockRows = [...(p?.stockItems ?? [])].sort((a, b) =>
    storeName(a.storeId).localeCompare(storeName(b.storeId)),
  );
  const totalQty = stockRows.reduce((sum, s) => sum + Number(s.quantity), 0);
  const reorderAt = p?.reorderLevel ?? 0;

  return (
    <Dialog open onClose={onClose} title={p?.name ?? 'Product'} className="max-w-2xl">
      {product.isError ? (
        <ErrorState onRetry={() => product.refetch()} />
      ) : !p ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-5">
          <div className="flex items-start gap-4">
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.imageUrl}
                alt={p.name}
                className="h-20 w-20 shrink-0 rounded-md border border-border object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                <Package className="h-7 w-7" />
              </div>
            )}
            <div className="min-w-0 space-y-1.5 text-sm">
              <div className="flex flex-wrap gap-1">
                {!p.isActive && <Badge tone="muted">Inactive</Badge>}
                {p.isRxRequired && <RxBadge />}
                {p.trackBatches && <Badge tone="warning">Batch</Badge>}
                {p.trackSerials && <Badge tone="warning">Serial</Badge>}
                {p.variantName && <Badge tone="primary">{p.variantName}</Badge>}
                {(p.categories ?? []).map((c) => (
                  <Badge key={c.id}>{c.name}</Badge>
                ))}
              </div>
              {p.brand && <div className="text-muted-foreground">Brand: {p.brand}</div>}
              {p.description && (
                <p className="whitespace-pre-line break-words text-muted-foreground">{p.description}</p>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-md border border-border p-4 text-sm sm:grid-cols-3">
            <Field label="Selling price" value={formatMoney(p.sellingPrice)} strong />
            <Field label="Cost price" value={formatMoney(p.costPrice)} />
            <Field label="Margin" value={margin === null ? '—' : `${margin.toFixed(1)}%`} />
            <Field label="SKU" value={p.sku || '—'} />
            <Field label="Barcode" value={p.barcode || '—'} mono />
            <Field label="Unit" value={p.unit} />
            <Field
              label="Tax"
              value={!p.isTaxable ? 'Not taxed' : p.tax ? `${p.tax.name} (${Number(p.tax.rate)}%)` : `${Number(p.taxRate)}%`}
            />
            <Field label="Reorder at" value={reorderAt ? String(reorderAt) : '—'} />
            {p.expiryDate && <Field label="Expiry" value={formatDate(p.expiryDate)} />}
          </dl>

          {!p._count?.variants && (
            <section>
              <SectionTitle>
                Stock{multiStore && stockRows.length > 0 ? ` · ${totalQty} ${p.unit} in total` : ''}
              </SectionTitle>
              {stockRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not stocked at any store yet.</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Store</TH>
                      <TH className="text-right">On hand</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {stockRows.map((s) => {
                      const qty = Number(s.quantity);
                      const low = reorderAt > 0 && qty <= reorderAt;
                      return (
                        <TR key={s.storeId} className={cn(s.storeId === storeId && 'bg-primary/5')}>
                          <TD className="font-medium">{storeName(s.storeId)}</TD>
                          <TD className={cn('text-right font-semibold', low && 'text-warning')}>
                            {s.quantity}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )}
            </section>
          )}

          {(p.variants?.length ?? 0) > 0 && (
            <section>
              <SectionTitle>Variants · {p.variants!.length}</SectionTitle>
              <Table>
                <THead>
                  <TR>
                    <TH>Variant</TH>
                    <TH className="hidden sm:table-cell">SKU</TH>
                    <TH className="text-right">Price</TH>
                  </TR>
                </THead>
                <TBody>
                  {p.variants!.map((v) => (
                    <TR key={v.id}>
                      <TD className="font-medium">{v.variantName || v.name}</TD>
                      <TD className="hidden text-muted-foreground sm:table-cell">{v.sku || '—'}</TD>
                      <TD className="text-right">{formatMoney(v.sellingPrice)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </section>
          )}

          <section>
            <SectionTitle>
              Recent stock changes{storeId && multiStore ? ` at ${storeName(storeId)}` : ''}
            </SectionTitle>
            {movements.isError ? (
              <p className="text-sm text-destructive">
                Couldn&rsquo;t load the history.{' '}
                <button type="button" className="font-medium underline" onClick={() => movements.refetch()}>
                  Retry
                </button>
              </p>
            ) : movements.isLoading ? (
              <LoadingBlock />
            ) : !movements.data?.data.length ? (
              <p className="text-sm text-muted-foreground">No stock changes yet.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>When</TH>
                    {multiStore && !storeId && <TH className="hidden sm:table-cell">Store</TH>}
                    <TH>Type</TH>
                    <TH className="text-right">Change</TH>
                    <TH className="hidden sm:table-cell">By</TH>
                  </TR>
                </THead>
                <TBody>
                  {movements.data.data.map((m) => {
                    const change = Number(m.quantity);
                    return (
                      <TR key={m.id}>
                        <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(m.createdAt)}</TD>
                        {multiStore && !storeId && (
                          <TD className="hidden text-muted-foreground sm:table-cell">{m.store?.name ?? '—'}</TD>
                        )}
                        <TD><Badge tone="muted">{m.type}</Badge></TD>
                        <TD className={cn('text-right font-medium', change >= 0 ? 'text-success' : 'text-destructive')}>
                          {change >= 0 ? '+' : ''}{m.quantity}
                        </TD>
                        <TD className="hidden text-muted-foreground sm:table-cell">{m.user?.name ?? '—'}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
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
        {p && actions}
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</h3>;
}

function Field({ label, value, strong, mono }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('truncate', strong && 'font-semibold', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}
