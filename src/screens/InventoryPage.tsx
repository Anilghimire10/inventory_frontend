'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, SlidersHorizontal, AlertTriangle, CalendarClock, History, ArrowLeftRight, Trash2, ClipboardCheck, Fingerprint } from 'lucide-react';
import { InventoryApi, ProductsApi } from '@/api';
import type { CountSheetLine, SerialStatus, StockItem, StockTakeResult } from '@/types';
import { useStores } from '@/hooks/useStores';
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

type Tab = 'stock' | 'low' | 'expiring' | 'movements' | 'stockTake' | 'serials';

export default function InventoryPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const { data: stores } = useStores();
  const [tab, setTab] = useState<Tab>('stock');
  const [stockPage, setStockPage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const [adjusting, setAdjusting] = useState<StockItem | null>(null);
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState('COUNT_CORRECTION');
  const [note, setNote] = useState('');

  const [transferOpen, setTransferOpen] = useState(false);
  const [fromStoreId, setFromStoreId] = useState('');
  const [toStoreId, setToStoreId] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferLines, setTransferLines] = useState<{ productId: string; quantity: number }[]>([]);
  const [pickTransferProduct, setPickTransferProduct] = useState('');

  const [countStoreIdOverride, setCountStoreIdOverride] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [seededSheet, setSeededSheet] = useState<CountSheetLine[] | undefined>(undefined);
  const [countNote, setCountNote] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState<StockTakeResult | null>(null);

  const [serialsPage, setSerialsPage] = useState(1);
  const [serialSearch, setSerialSearch] = useState('');
  const [serialStatus, setSerialStatus] = useState<SerialStatus | ''>('');
  const [serialProductId, setSerialProductId] = useState('');

  const stock = useQuery({
    queryKey: ['stock', stockPage],
    queryFn: () => InventoryApi.stock({ page: stockPage, limit: 20 }),
    enabled: tab === 'stock',
  });
  const low = useQuery({
    queryKey: ['low-stock'],
    queryFn: () => InventoryApi.lowStock(),
    enabled: tab === 'low',
  });
  const expiring = useQuery({
    queryKey: ['expiring'],
    queryFn: () => InventoryApi.expiring({ days: 30 }),
    enabled: tab === 'expiring',
  });
  const movements = useQuery({
    queryKey: ['movements', movementPage],
    queryFn: () => InventoryApi.movements({ page: movementPage, limit: 20 }),
    enabled: tab === 'movements',
  });
  const serials = useQuery({
    queryKey: ['serials', serialsPage, serialSearch, serialStatus, serialProductId],
    queryFn: () =>
      InventoryApi.serials({
        page: serialsPage,
        limit: 20,
        search: serialSearch || undefined,
        status: serialStatus || undefined,
        productId: serialProductId || undefined,
      }),
    enabled: tab === 'serials',
  });

  const adjust = useMutation({
    mutationFn: () =>
      InventoryApi.adjust({
        storeId: adjusting!.storeId,
        productId: adjusting!.productId,
        delta,
        reason,
        note: note || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      show('Stock adjusted');
      setAdjusting(null);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const openAdjust = (item: StockItem) => {
    setAdjusting(item);
    setDelta(0);
    setReason('COUNT_CORRECTION');
    setNote('');
  };

  const { data: products } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => ProductsApi.list({ limit: 100 }),
    enabled: transferOpen || tab === 'serials',
  });

  const transfer = useMutation({
    mutationFn: () =>
      InventoryApi.transfer({
        fromStoreId,
        toStoreId,
        note: transferNote || undefined,
        items: transferLines,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      show('Stock transferred');
      setTransferOpen(false);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const openTransfer = () => {
    setFromStoreId(stores?.[0]?.id ?? '');
    setToStoreId(stores?.[1]?.id ?? '');
    setTransferNote('');
    setTransferLines([]);
    setPickTransferProduct('');
    setTransferOpen(true);
  };

  const addTransferLine = (productId: string) => {
    if (!productId || transferLines.some((l) => l.productId === productId)) return;
    setTransferLines((ls) => [...ls, { productId, quantity: 1 }]);
    setPickTransferProduct('');
  };
  const updateTransferLine = (i: number, quantity: number) =>
    setTransferLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, quantity } : l)));
  const removeTransferLine = (i: number) =>
    setTransferLines((ls) => ls.filter((_, idx) => idx !== i));

  const transferProductName = (id: string) =>
    products?.data.find((p) => p.id === id)?.name ?? id;

  const sameStore = !!fromStoreId && fromStoreId === toStoreId;
  const canTransfer =
    !!fromStoreId &&
    !!toStoreId &&
    !sameStore &&
    transferLines.length > 0 &&
    transferLines.every((l) => l.quantity > 0);

  // Falls back to the first store until the user picks one explicitly.
  const countStoreId = countStoreIdOverride || stores?.[0]?.id || '';

  const countSheet = useQuery({
    queryKey: ['count-sheet', countStoreId],
    queryFn: () => InventoryApi.countSheet(countStoreId),
    enabled: tab === 'stockTake' && !!countStoreId,
  });

  // Re-seed the editable counts to the system quantity whenever a fresh sheet loads
  // (new store, or after a post refetches it) -- untouched lines then post as zero variance.
  if (countSheet.data && countSheet.data !== seededSheet) {
    setSeededSheet(countSheet.data);
    setCounts(Object.fromEntries(countSheet.data.map((l) => [l.productId, l.system])));
  }

  const buildCounts = () =>
    (countSheet.data ?? []).map((l) => ({
      productId: l.productId,
      counted: counts[l.productId] ?? l.system,
    }));

  const previewTake = useMutation({
    mutationFn: () =>
      InventoryApi.stockTake({
        storeId: countStoreId,
        preview: true,
        note: countNote || undefined,
        counts: buildCounts(),
      }),
    onSuccess: (data) => {
      setReview(data);
      setReviewOpen(true);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const postTake = useMutation({
    mutationFn: () =>
      InventoryApi.stockTake({
        storeId: countStoreId,
        note: countNote || undefined,
        counts: buildCounts(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      qc.invalidateQueries({ queryKey: ['count-sheet'] });
      show('Stock take posted');
      setReviewOpen(false);
      setCountNote('');
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const changedCount = (countSheet.data ?? []).filter(
    (l) => (counts[l.productId] ?? l.system) !== l.system,
  ).length;

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'stock', label: 'Stock levels', icon: Boxes },
    { key: 'low', label: 'Low stock', icon: AlertTriangle },
    { key: 'expiring', label: 'Expiring', icon: CalendarClock },
    { key: 'movements', label: 'History', icon: History },
    { key: 'stockTake', label: 'Stock take', icon: ClipboardCheck },
    { key: 'serials', label: 'Serials', icon: Fingerprint },
  ];

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Stock levels, alerts, and movement history."
        action={
          stores && stores.length > 1 ? (
            <Button variant="outline" onClick={openTransfer}>
              <ArrowLeftRight className="h-4 w-4" /> Transfer stock
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        stock.isError ? <ErrorState onRetry={() => stock.refetch()} /> :
        stock.isLoading ? <LoadingBlock /> :
        !stock.data || stock.data.data.length === 0 ? (
          <EmptyState title="No stock records" description="Stock appears once you receive purchases or adjust manually." icon={Boxes} />
        ) : (
          <>
            <StockTable items={stock.data.data} onAdjust={openAdjust} />
            <Pagination page={stock.data.meta.page} pages={stock.data.meta.pages} onPage={setStockPage} />
          </>
        )
      )}

      {tab === 'low' && (
        low.isError ? <ErrorState onRetry={() => low.refetch()} /> :
        low.isLoading ? <LoadingBlock /> :
        !low.data || low.data.length === 0 ? (
          <EmptyState title="All good!" description="No items are below their reorder level." icon={AlertTriangle} />
        ) : (
          <StockTable items={low.data} onAdjust={openAdjust} lowMode />
        )
      )}

      {tab === 'expiring' && (
        expiring.isError ? <ErrorState onRetry={() => expiring.refetch()} /> :
        expiring.isLoading ? <LoadingBlock /> :
        !expiring.data || expiring.data.length === 0 ? (
          <EmptyState title="Nothing expiring soon" description="No batches expire within 30 days." icon={CalendarClock} />
        ) : (
          <Table>
            <THead><TR><TH>Product</TH><TH>Batch</TH><TH>Expires</TH><TH className="text-right">Qty</TH></TR></THead>
            <TBody>
              {expiring.data.map((b) => (
                <TR key={b.id}>
                  <TD className="font-medium">{b.product.name}</TD>
                  <TD className="text-muted-foreground">{b.batchNumber || '—'}</TD>
                  <TD><Badge tone="destructive">{formatDate(b.expiryDate)}</Badge></TD>
                  <TD className="text-right">{b.quantity}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      )}

      {tab === 'movements' && (
        movements.isError ? <ErrorState onRetry={() => movements.refetch()} /> :
        movements.isLoading ? <LoadingBlock /> :
        !movements.data || movements.data.data.length === 0 ? (
          <EmptyState title="No movements yet" description="Every stock change will be logged here." icon={History} />
        ) : (
          <>
            <Table>
              <THead><TR><TH>When</TH><TH>Product</TH><TH>Type</TH><TH className="text-right">Change</TH><TH>By</TH></TR></THead>
              <TBody>
                {movements.data.data.map((m) => (
                  <TR key={m.id}>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(m.createdAt)}</TD>
                    <TD className="font-medium">{m.product.name}</TD>
                    <TD><Badge tone="muted">{m.type}</Badge></TD>
                    <TD className={cn('text-right font-medium', m.quantity >= 0 ? 'text-success' : 'text-destructive')}>
                      {m.quantity >= 0 ? '+' : ''}{m.quantity}
                    </TD>
                    <TD className="text-muted-foreground">{m.user?.name ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={movements.data.meta.page} pages={movements.data.meta.pages} onPage={setMovementPage} />
          </>
        )
      )}

      {tab === 'stockTake' && (
        <div className="space-y-4">
          {stores && stores.length > 1 && (
            <Field label="Store">
              <Select value={countStoreId} onChange={(e) => setCountStoreIdOverride(e.target.value)} className="max-w-xs">
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          )}

          {countSheet.isError ? <ErrorState onRetry={() => countSheet.refetch()} /> :
            countSheet.isLoading ? <LoadingBlock /> :
            !countSheet.data || countSheet.data.length === 0 ? (
              <EmptyState title="No products to count" description="Add active products before running a stock take." icon={ClipboardCheck} />
            ) : (
              <>
                <Table>
                  <THead>
                    <TR>
                      <TH>Product</TH>
                      <TH>SKU</TH>
                      <TH className="text-right">System</TH>
                      <TH className="text-right">Counted</TH>
                      <TH className="text-right">Variance</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {countSheet.data.map((l) => {
                      const counted = counts[l.productId] ?? l.system;
                      const variance = counted - l.system;
                      return (
                        <TR key={l.productId}>
                          <TD className="font-medium">{l.name}</TD>
                          <TD className="text-muted-foreground">{l.sku || '—'}</TD>
                          <TD className="text-right text-muted-foreground">{l.system}</TD>
                          <TD className="text-right">
                            <Input type="number" step="0.001" min="0" className="ml-auto h-8 w-24 text-right"
                              value={counted}
                              onChange={(e) =>
                                setCounts((c) => ({ ...c, [l.productId]: Number(e.target.value) || 0 }))
                              } />
                          </TD>
                          <TD className={cn(
                            'text-right font-medium',
                            variance > 0 && 'text-success',
                            variance < 0 && 'text-destructive',
                          )}>
                            {variance > 0 ? '+' : ''}{variance || 0}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>

                <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end sm:justify-between">
                  <Field label="Note (optional)" className="max-w-sm">
                    <Input value={countNote} onChange={(e) => setCountNote(e.target.value)} />
                  </Field>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {changedCount} of {countSheet.data.length} item{countSheet.data.length !== 1 ? 's' : ''} differ
                    </span>
                    <Button onClick={() => previewTake.mutate()} loading={previewTake.isPending}
                      disabled={changedCount === 0}>
                      Review stock take
                    </Button>
                  </div>
                </div>
              </>
            )}
        </div>
      )}

      {tab === 'serials' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-xs"
              placeholder="Search by serial number…"
              value={serialSearch}
              onChange={(e) => { setSerialSearch(e.target.value); setSerialsPage(1); }}
            />
            <Select
              className="max-w-xs"
              value={serialProductId}
              onChange={(e) => { setSerialProductId(e.target.value); setSerialsPage(1); }}
            >
              <option value="">All products</option>
              {(products?.data ?? []).filter((p) => p.trackSerials).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Select
              className="max-w-xs"
              value={serialStatus}
              onChange={(e) => { setSerialStatus(e.target.value as SerialStatus | ''); setSerialsPage(1); }}
            >
              <option value="">All statuses</option>
              <option value="IN_STOCK">In stock</option>
              <option value="SOLD">Sold</option>
              <option value="RETURNED_TO_SUPPLIER">Returned to supplier</option>
            </Select>
          </div>

          {serials.isError ? <ErrorState onRetry={() => serials.refetch()} /> :
          serials.isLoading ? <LoadingBlock /> :
          !serials.data || serials.data.data.length === 0 ? (
            <EmptyState title="No serials found" description="Units tracked by serial/IMEI will show up here once received." icon={Fingerprint} />
          ) : (
            <>
              <Table>
                <THead><TR><TH>Serial #</TH><TH>Product</TH><TH>Status</TH><TH>Store</TH><TH>Sold to</TH><TH>Updated</TH></TR></THead>
                <TBody>
                  {serials.data.data.map((s) => (
                    <TR key={s.id}>
                      <TD className="font-medium">{s.serialNumber}</TD>
                      <TD>{s.product.name}</TD>
                      <TD>
                        <Badge tone={s.status === 'IN_STOCK' ? 'success' : s.status === 'SOLD' ? 'muted' : 'destructive'}>
                          {s.status === 'IN_STOCK' ? 'In stock' : s.status === 'SOLD' ? 'Sold' : 'Returned'}
                        </Badge>
                      </TD>
                      <TD className="text-muted-foreground">{s.store?.name ?? '—'}</TD>
                      <TD className="text-muted-foreground">
                        {s.sale ? `${s.sale.customer?.name ?? 'Walk-in'} · ${s.sale.receiptNo}` : '—'}
                      </TD>
                      <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(s.updatedAt)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination page={serials.data.meta.page} pages={serials.data.meta.pages} onPage={setSerialsPage} />
            </>
          )}
        </div>
      )}

      <Dialog open={!!adjusting} onClose={() => setAdjusting(null)} title="Adjust stock"
        description={adjusting?.product.name}>
        <form onSubmit={(e) => { e.preventDefault(); adjust.mutate(); }} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Current quantity: <span className="font-medium text-foreground">{adjusting?.quantity}</span>
            {stores && stores.length > 1 && adjusting?.store && <> · {adjusting.store.name}</>}
          </p>
          <Field label="Change (use negative to remove)">
            <Input type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value))} autoFocus />
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
          <Field label="Note (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAdjusting(null)}>Cancel</Button>
            <Button type="submit" loading={adjust.isPending} disabled={delta === 0}>Apply</Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog open={transferOpen} onClose={() => setTransferOpen(false)} title="Transfer stock"
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
            <Select value={pickTransferProduct} onChange={(e) => addTransferLine(e.target.value)}>
              <option value="">Select a product to add…</option>
              {products?.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>

          {transferLines.length > 0 && (
            <div className="space-y-2">
              {transferLines.map((l, i) => (
                <div key={l.productId} className="flex items-center gap-3 rounded-md border border-border p-3">
                  <span className="flex-1 font-medium">{transferProductName(l.productId)}</span>
                  <Input type="number" step="0.001" min="0.001" className="w-28"
                    value={l.quantity}
                    onChange={(e) => updateTransferLine(i, Number(e.target.value))} />
                  <Button size="icon" variant="ghost" onClick={() => removeTransferLine(i)}
                    aria-label={`Remove ${transferProductName(l.productId)}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Field label="Note (optional)">
            <Input value={transferNote} onChange={(e) => setTransferNote(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
          <Button loading={transfer.isPending} disabled={!canTransfer} onClick={() => transfer.mutate()}>
            Transfer {transferLines.length} item{transferLines.length !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} title="Review stock take"
        description="Only lines with a variance will post an adjustment." className="max-w-2xl">
        {review && (
          <div className="space-y-4">
            {review.adjusted === 0 ? (
              <p className="text-sm text-muted-foreground">No variances — nothing to post.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Product</TH>
                    <TH className="text-right">System</TH>
                    <TH className="text-right">Counted</TH>
                    <TH className="text-right">Variance</TH>
                  </TR>
                </THead>
                <TBody>
                  {review.lines.filter((l) => l.variance !== 0).map((l) => (
                    <TR key={l.productId}>
                      <TD className="font-medium">{l.name}</TD>
                      <TD className="text-right text-muted-foreground">{l.system}</TD>
                      <TD className="text-right">{l.counted}</TD>
                      <TD className={cn('text-right font-medium', l.variance > 0 ? 'text-success' : 'text-destructive')}>
                        {l.variance > 0 ? '+' : ''}{l.variance}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setReviewOpen(false)}>Back</Button>
          <Button loading={postTake.isPending} disabled={!review || review.adjusted === 0}
            onClick={() => postTake.mutate()}>
            Post stock take
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function StockTable({
  items,
  onAdjust,
  lowMode,
}: {
  items: StockItem[];
  onAdjust: (i: StockItem) => void;
  lowMode?: boolean;
}) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Product</TH>
          <TH>SKU</TH>
          <TH className="text-right">Qty</TH>
          <TH className="text-right">Reorder at</TH>
          <TH></TH>
        </TR>
      </THead>
      <TBody>
        {items.map((it) => {
          const reorder =
            it.effectiveReorderLevel ?? (it.reorderLevel || it.product.reorderLevel || 0);
          const lowFlag = reorder > 0 && Number(it.quantity) <= reorder;
          return (
            <TR key={it.id}>
              <TD className="font-medium">{it.product.name}</TD>
              <TD className="text-muted-foreground">{it.product.sku || '—'}</TD>
              <TD className="text-right">
                <span className={cn('font-semibold', (lowMode || lowFlag) && 'text-warning')}>
                  {it.quantity}
                </span>
              </TD>
              <TD className="text-right text-muted-foreground">{reorder || '—'}</TD>
              <TD className="text-right">
                <Button size="sm" variant="outline" onClick={() => onAdjust(it)}>
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Adjust
                </Button>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}