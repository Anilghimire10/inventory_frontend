'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, SlidersHorizontal, AlertTriangle, CalendarClock, History, ArrowLeftRight, Trash2, ClipboardCheck, Fingerprint, PackagePlus, Target, Upload } from 'lucide-react';
import { InventoryApi, ProductsApi, PurchasesApi } from '@/api';
import type { Batch, CountSheetLine, Product, ReorderSuggestionGroup, SerialStatus, StockItem, StockTakeResult } from '@/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { daysToExpiry } from '@/lib/expiry';
import { SerialPicker } from '@/components/SerialPicker';
import { ImportDialog } from '@/components/ImportDialog';
import { exportCsv } from '@/lib/csv';

const STOCK_COLUMNS = [
  { key: 'sku', label: 'SKU' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'name', label: 'Name' },
  { key: 'store', label: 'Store' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'cost', label: 'Cost price' },
  { key: 'batch', label: 'Batch' },
  { key: 'expiry', label: 'Expiry date' },
  { key: 'serials', label: 'Serials' },
];

const STOCK_TEMPLATE = [
  { sku: 'RICE-1KG', barcode: '', name: 'Basmati rice 1kg', store: '', quantity: 40, cost: 180, batch: 'B-2409', expiry: '2027-06-30', serials: '' },
  { sku: 'SAM-A15', barcode: '', name: 'Samsung Galaxy A15', store: '', quantity: 2, cost: 21000, batch: '', expiry: '', serials: '354900112233441|354900112233442' },
];

const STOCK_IMPORT_HELP = [
  { name: 'SKU, Barcode or Name', required: true, note: 'which product; the first one filled in is used, and Name must match exactly' },
  { name: 'Quantity', required: true, note: 'how many to add to what is already there' },
  { name: 'Store', note: 'branch name; blank uses the branch picked at the top of the app' },
  { name: 'Cost price', note: 'what each unit cost; fills in the product’s cost if it has none' },
  { name: 'Batch, Expiry date', note: 'for batch-tracked products (expiry like 2027-06-30); for other products, Expiry date sets the product’s expiry' },
  { name: 'Serials', note: 'for serial-tracked products: one per unit, separated by |' },
];
import { useActiveStores } from '@/hooks/useStores';
import { useStoreScope } from '@/store/StoreContext';
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
import { Hint, Tooltip } from '@/components/ui/tooltip';
import { SearchPicker } from '@/components/SearchPicker';
import { apiError } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const SERIAL_STATUS_LABEL: Record<SerialStatus, string> = {
  IN_STOCK: 'In stock',
  SOLD: 'Sold',
  RETURNED_TO_SUPPLIER: 'Returned',
  DAMAGED: 'Damaged',
  LOST: 'Lost',
};

const TABS = ['stock', 'low', 'reorder', 'expiring', 'movements', 'stockTake', 'serials'] as const;
type Tab = (typeof TABS)[number];
const isTab = (v: string | null): v is Tab => (TABS as readonly string[]).includes(v ?? '');

/** Which suggestions a pending "create drafts" confirmation covers. */
type DraftTarget = { storeId?: string; supplierId?: string; label: string };

export default function InventoryPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const { data: stores } = useActiveStores();
  // The tab lives in the URL (?tab=expiring), so the dashboard tiles, the
  // Analytics shortcuts and the bell's alerts open the right one -- even when
  // this page is already showing -- and a reload stays put.
  const router = useRouter();
  const tabParam = useSearchParams().get('tab');
  const tab: Tab = isTab(tabParam) ? tabParam : 'stock';
  const setTab = (t: Tab) => router.replace(t === 'stock' ? '/inventory' : `/inventory?tab=${t}`, { scroll: false });
  const [stockPage, setStockPage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const [adjusting, setAdjusting] = useState<StockItem | null>(null);
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState('COUNT_CORRECTION');
  const [note, setNote] = useState('');
  // Serialised products: the units added or removed by this adjustment.
  const [adjustSerials, setAdjustSerials] = useState<string[]>([]);

  const [transferOpen, setTransferOpen] = useState(false);
  const [fromStoreId, setFromStoreId] = useState('');
  const [toStoreId, setToStoreId] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferLines, setTransferLines] = useState<
    { productId: string; name: string; quantity: number; trackSerials?: boolean; serials?: string[]; pickUnits?: boolean }[]
  >([]);

  const [countStoreIdOverride, setCountStoreIdOverride] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  // Serialised products are counted by ticking units: the units found, by product.
  const [serialCounts, setSerialCounts] = useState<Record<string, string[]>>({});
  const [countingSerials, setCountingSerials] = useState<CountSheetLine | null>(null);
  const [seededSheet, setSeededSheet] = useState<CountSheetLine[] | undefined>(undefined);
  const [countNote, setCountNote] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState<StockTakeResult | null>(null);

  const [reorderTarget, setReorderTarget] = useState<StockItem | null>(null);
  const [reorderLevelInput, setReorderLevelInput] = useState(0);

  const [reorderStoreId, setReorderStoreId] = useState('');
  const [draftTarget, setDraftTarget] = useState<DraftTarget | null>(null);

  const [serialsPage, setSerialsPage] = useState(1);
  const [serialSearch, setSerialSearch] = useState('');
  const [serialStatus, setSerialStatus] = useState<SerialStatus | ''>('');
  const [serialProduct, setSerialProduct] = useState<{ id: string; label: string } | null>(null);
  const serialProductId = serialProduct?.id ?? '';

  // Every list on this page follows the branch chosen in the header. The
  // server scopes pinned staff on its own; this is what lets an owner review
  // one branch at a time.
  const { storeId } = useStoreScope();
  const [importingStock, setImportingStock] = useState(false);
  const forStore = storeId || undefined;
  // Only when a row could be from any of several branches: with a store
  // selected every row is that store's, and one store is no ambiguity at all.
  const showStoreColumn = !storeId && (stores?.length ?? 0) > 1;
  // A branch switch can land you past the end of the new list. Adjusted during
  // render (React's documented pattern) rather than in an effect.
  const [prevStore, setPrevStore] = useState(storeId);
  if (prevStore !== storeId) {
    setPrevStore(storeId);
    setStockPage(1);
    setMovementPage(1);
    setSerialsPage(1);
  }

  const stock = useQuery({
    queryKey: ['stock', stockPage, storeId],
    queryFn: () => InventoryApi.stock({ page: stockPage, limit: 20, storeId: forStore }),
    enabled: tab === 'stock',
  });
  const low = useQuery({
    queryKey: ['low-stock', storeId],
    queryFn: () => InventoryApi.lowStock(forStore),
    enabled: tab === 'low',
  });
  const expiring = useQuery({
    queryKey: ['expiring', storeId],
    queryFn: () => InventoryApi.expiring({ days: 30, storeId: forStore }),
    enabled: tab === 'expiring',
  });
  const movements = useQuery({
    queryKey: ['movements', movementPage, storeId],
    queryFn: () =>
      InventoryApi.movements({ page: movementPage, limit: 20, storeId: forStore }),
    enabled: tab === 'movements',
  });
  const serials = useQuery({
    queryKey: ['serials', serialsPage, serialSearch, serialStatus, serialProductId, storeId],
    queryFn: () =>
      InventoryApi.serials({
        page: serialsPage,
        limit: 20,
        storeId: forStore,
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
        ...(serialAdjust ? { serials: adjustSerials } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      qc.invalidateQueries({ queryKey: ['serials'] });
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
    setAdjustSerials([]);
  };

  // A serialised product names its units: whole numbers only, one serial each.
  const serialAdjust = !!adjusting?.product.trackSerials;
  const adjustReady =
    delta !== 0 &&
    (!serialAdjust || (Number.isInteger(delta) && adjustSerials.length === Math.abs(delta)));

  // 0 clears the per-store override and falls back to the product default.
  const openReorderLevel = (item: StockItem) => {
    setReorderTarget(item);
    setReorderLevelInput(item.reorderLevel || 0);
  };

  const saveReorderLevel = useMutation({
    mutationFn: () =>
      InventoryApi.setReorderLevel({
        storeId: reorderTarget!.storeId,
        productId: reorderTarget!.productId,
        reorderLevel: reorderLevelInput,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
      qc.invalidateQueries({ queryKey: ['reorder-suggestions'] });
      show('Reorder level updated');
      setReorderTarget(null);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

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
      setTransferOpen(false);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const openTransfer = () => {
    setFromStoreId(stores?.[0]?.id ?? '');
    setToStoreId(stores?.[1]?.id ?? '');
    setTransferNote('');
    setTransferLines([]);
    setTransferOpen(true);
  };

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
    setSerialCounts({});
  }

  const buildCounts = () =>
    (countSheet.data ?? []).map((l) => ({
      productId: l.productId,
      counted: counts[l.productId] ?? l.system,
      ...(serialCounts[l.productId] ? { serials: serialCounts[l.productId] } : {}),
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
      qc.invalidateQueries({ queryKey: ['serials'] });
      show('Stock take posted');
      setReviewOpen(false);
      setCountNote('');
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  // Unlike the count sheet, this spans every store unless one is picked --
  // the server groups by store anyway, so "All stores" is a useful default.
  const reorder = useQuery({
    queryKey: ['reorder-suggestions', reorderStoreId],
    queryFn: () => PurchasesApi.reorderSuggestions(reorderStoreId || undefined),
    enabled: tab === 'reorder',
  });

  const createDrafts = useMutation({
    mutationFn: (t: DraftTarget) =>
      PurchasesApi.reorderDrafts({ storeId: t.storeId, supplierId: t.supplierId }),
    onSuccess: (drafts) => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['reorder-suggestions'] });
      show(
        `${drafts.length} draft order${drafts.length !== 1 ? 's' : ''} created — ` +
          'review them on Purchases.',
      );
      setDraftTarget(null);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const suggestedItemCount = (reorder.data ?? []).reduce(
    (n, g) => n + g.items.length,
    0,
  );

  const changedCount = (countSheet.data ?? []).filter(
    (l) => (counts[l.productId] ?? l.system) !== l.system,
  ).length;

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'stock', label: 'Stock levels', icon: Boxes },
    { key: 'low', label: 'Low stock', icon: AlertTriangle },
    { key: 'reorder', label: 'Reorder', icon: PackagePlus },
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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImportingStock(true)}>
              <Upload className="h-4 w-4" /> Import stock
            </Button>
            {stores && stores.length > 1 && (
              <Button variant="outline" onClick={openTransfer}>
                <ArrowLeftRight className="h-4 w-4" /> Transfer stock
              </Button>
            )}
          </div>
        }
      />

      <ImportDialog
        open={importingStock}
        onClose={() => setImportingStock(false)}
        title="Import stock"
        intro={
          'Add the stock you already have — for example on your first day — from a spreadsheet. Each row adds a quantity of one product at one branch. ' +
          (storeId
            ? 'Rows with no Store go to the branch picked at the top of the app.'
            : (stores?.length ?? 0) > 1
              ? 'You have more than one branch: fill in the Store column, or pick a branch at the top of the app first.'
              : '')
        }
        columns={STOCK_IMPORT_HELP}
        onTemplate={() => void exportCsv('stock-import-template', STOCK_COLUMNS, STOCK_TEMPLATE).catch((e) => show(apiError(e), 'error'))}
        check={async (rows) => {
          const r = await InventoryApi.importStock(rows, { storeId: storeId || undefined, dryRun: true });
          return {
            counts: [{ label: 'Rows to add', value: r.rows ?? 0 }, { label: 'Units in total', value: r.units }],
            toImport: r.rows ?? 0,
            errors: r.errors,
          };
        }}
        run={async (rows) => {
          const r = await InventoryApi.importStock(rows, { storeId: storeId || undefined });
          qc.invalidateQueries({ queryKey: ['stock'] });
          qc.invalidateQueries({ queryKey: ['movements'] });
          qc.invalidateQueries({ queryKey: ['serials'] });
          qc.invalidateQueries({ queryKey: ['expiring'] });
          qc.invalidateQueries({ queryKey: ['products'] });
          return { message: `Added ${r.imported ?? 0} rows — ${r.units} units in total.`, errors: r.errors };
        }}
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
            <StockTable items={stock.data.data} onAdjust={openAdjust} onReorderLevel={openReorderLevel} showStore={showStoreColumn} />
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
          <StockTable items={low.data} onAdjust={openAdjust} onReorderLevel={openReorderLevel} lowMode showStore={showStoreColumn} />
        )
      )}

      {tab === 'reorder' && (
        <div className="space-y-4">
          {stores && stores.length > 1 && (
            <Field label="Store">
              <Select
                value={reorderStoreId}
                onChange={(e) => setReorderStoreId(e.target.value)}
                className="max-w-xs"
              >
                <option value="">All stores</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          )}

          {reorder.isError ? <ErrorState onRetry={() => reorder.refetch()} /> :
            reorder.isLoading ? <LoadingBlock /> :
            !reorder.data || reorder.data.length === 0 ? (
              <EmptyState
                title="Nothing to reorder"
                description="No items are at or below their reorder level."
                icon={PackagePlus}
              />
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    {suggestedItemCount} item{suggestedItemCount !== 1 ? 's' : ''} below
                    reorder level, grouped into {reorder.data.length} order
                    {reorder.data.length !== 1 ? 's' : ''}. Suggested quantities restock
                    each item to twice its reorder level, priced at the last cost paid.
                  </p>
                  <Button
                    className="shrink-0"
                    onClick={() =>
                      setDraftTarget({
                        storeId: reorderStoreId || undefined,
                        label: `all ${reorder.data!.length} suggested order${reorder.data!.length !== 1 ? 's' : ''}`,
                      })
                    }
                  >
                    <PackagePlus className="h-4 w-4" /> Create all drafts
                  </Button>
                </div>

                {reorder.data.map((g) => (
                  <ReorderGroupCard
                    key={`${g.storeId}|${g.supplierId ?? ''}`}
                    group={g}
                    multiStore={!!stores && stores.length > 1}
                    onDraft={setDraftTarget}
                  />
                ))}
              </>
            )}
        </div>
      )}

      {tab === 'expiring' && (
        expiring.isError ? <ErrorState onRetry={() => expiring.refetch()} /> :
        expiring.isLoading ? <LoadingBlock /> :
        !expiring.data || expiring.data.length === 0 ? (
          <EmptyState title="Nothing expiring soon" description="No stock expires within 30 days." icon={CalendarClock} />
        ) : (
          <ExpiringTab rows={expiring.data} showStore={showStoreColumn} />
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
              <THead><TR><TH>When</TH><TH>Product</TH>{showStoreColumn && <TH>Store</TH>}<TH>Type</TH><TH className="text-right">Change</TH><TH>By</TH></TR></THead>
              <TBody>
                {movements.data.data.map((m) => {
                  // Decimal(12,3) string: coerce for the sign test, but print
                  // the value as the server wrote it.
                  const change = Number(m.quantity);
                  return (
                    <TR key={m.id}>
                      <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(m.createdAt)}</TD>
                      <TD className="font-medium">{m.product.name}</TD>
                      {showStoreColumn && (
                        <TD className="text-muted-foreground">{m.store?.name ?? '—'}</TD>
                      )}
                      <TD><Badge tone="muted">{m.type}</Badge></TD>
                      <TD className={cn('text-right font-medium', change >= 0 ? 'text-success' : 'text-destructive')}>
                        {change >= 0 ? '+' : ''}{m.quantity}
                      </TD>
                      <TD className="text-muted-foreground">{m.user?.name ?? '—'}</TD>
                    </TR>
                  );
                })}
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
                      <TH className="text-right"><Hint tip="Counted minus the system quantity. Negative means stock is missing.">Variance</Hint></TH>
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
                            {l.trackSerials ? (
                              // Serialised: counted by ticking units, so the serial list follows.
                              <Button size="sm" variant="outline" className="ml-auto h-8"
                                onClick={() => setCountingSerials(l)}>
                                {serialCounts[l.productId] ? `${counted} ticked` : 'Tick units'}
                              </Button>
                            ) : (
                              <Input type="number" step="0.001" min="0" className="ml-auto h-8 w-24 text-right"
                                value={counted}
                                onChange={(e) =>
                                  setCounts((c) => ({ ...c, [l.productId]: Number(e.target.value) || 0 }))
                                } />
                            )}
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
          <div className="flex flex-wrap items-start gap-2">
            <Input
              className="max-w-xs"
              placeholder="Search by serial number…"
              value={serialSearch}
              onChange={(e) => { setSerialSearch(e.target.value); setSerialsPage(1); }}
            />
            <SearchPicker<Product>
              className="w-full max-w-xs"
              queryKey={['products', 'pick', 'serialised']}
              fetchPage={(search, limit) =>
                ProductsApi.list({ search: search || undefined, limit, trackSerials: true, activeOnly: false })
              }
              label={(p) => p.name}
              detail={(p) => p.sku}
              selected={serialProduct}
              noneLabel="All products"
              onPick={(p) => { setSerialProduct(p ? { id: p.id, label: p.name } : null); setSerialsPage(1); }}
              placeholder="Search serialised products…"
              aria-label="Filter by product"
            />
            <Select
              className="max-w-xs"
              value={serialStatus}
              onChange={(e) => { setSerialStatus(e.target.value as SerialStatus | ''); setSerialsPage(1); }}
            >
              <option value="">All statuses</option>
              <option value="IN_STOCK">In stock</option>
              <option value="SOLD">Sold</option>
              <option value="RETURNED_TO_SUPPLIER">Returned to supplier</option>
              <option value="DAMAGED">Damaged</option>
              <option value="LOST">Lost</option>
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
                          {SERIAL_STATUS_LABEL[s.status]}
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
          {serialAdjust && delta !== 0 && adjusting && (
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
            <Button type="button" variant="outline" onClick={() => setAdjusting(null)}>Cancel</Button>
            <Button type="submit" loading={adjust.isPending} disabled={!adjustReady}>Apply</Button>
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
          <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
          <Button loading={transfer.isPending} disabled={!canTransfer} onClick={() => transfer.mutate()}>
            Transfer {transferLines.length} item{transferLines.length !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!countingSerials} onClose={() => setCountingSerials(null)} title="Count by serial number"
        description={countingSerials ? `${countingSerials.name}: untick units that aren’t here, scan any extra ones you find.` : undefined}>
        {countingSerials && (
          <div className="space-y-4">
            <SerialPicker
              storeId={countStoreId}
              productId={countingSerials.productId}
              allowExtra
              value={serialCounts[countingSerials.productId] ?? countingSerials.serials ?? []}
              onChange={(serials) => {
                setSerialCounts((c) => ({ ...c, [countingSerials.productId]: serials }));
                setCounts((c) => ({ ...c, [countingSerials.productId]: serials.length }));
              }}
            />
            <p className="text-xs text-muted-foreground">
              System quantity {countingSerials.system}. Units not ticked are marked Lost when the stock take is posted;
              extra ones you scan go into stock.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => {
            // Opening the list counts it: ticked-as-on-file is still a count.
            if (countingSerials && !serialCounts[countingSerials.productId]) {
              const all = countingSerials.serials ?? [];
              setSerialCounts((c) => ({ ...c, [countingSerials.productId]: all }));
              setCounts((c) => ({ ...c, [countingSerials.productId]: all.length }));
            }
            setCountingSerials(null);
          }}>Done</Button>
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
                    <TH className="text-right"><Hint tip="Counted minus the system quantity. Negative means stock is missing.">Variance</Hint></TH>
                  </TR>
                </THead>
                <TBody>
                  {review.lines.filter((l) => l.variance !== 0).map((l) => (
                    <TR key={l.productId}>
                      <TD className="font-medium">
                        {l.name}
                        {l.needsSerials && (
                          <span className="block text-xs text-destructive">Tick its units before posting</span>
                        )}
                      </TD>
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
          <Button loading={postTake.isPending}
            disabled={!review || review.adjusted === 0 || review.lines.some((l) => l.needsSerials)}
            onClick={() => postTake.mutate()}>
            Post stock take
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={!!draftTarget}
        onClose={() => setDraftTarget(null)}
        title="Create draft purchase orders"
        description={`This raises ${draftTarget?.label ?? ''} on the Purchases page.`}
      >
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            The orders are saved as <strong className="text-foreground">drafts</strong> —
            nothing is received and nothing is paid. Stock only moves when the goods
            arrive and you receive the order.
          </li>
          <li>
            Quantities are recalculated on the server as you confirm, so they can differ
            from the table above if stock moved in the meantime.
          </li>
          <li>
            Confirming again later creates a{' '}
            <strong className="text-foreground">second set</strong> of drafts — the
            suggestions do not disappear once ordered.
          </li>
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDraftTarget(null)}>Cancel</Button>
          <Button
            loading={createDrafts.isPending}
            onClick={() => draftTarget && createDrafts.mutate(draftTarget)}
          >
            Create drafts
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={!!reorderTarget}
        onClose={() => setReorderTarget(null)}
        title="Reorder level"
        description={
          reorderTarget
            ? `${reorderTarget.product.name} at ${reorderTarget.store?.name ?? 'this store'}`
            : undefined
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
            {reorderTarget?.product.reorderLevel
              ? `Leave 0 to fall back to the product default of ${reorderTarget.product.reorderLevel}.`
              : 'Leave 0 for no alert — this product has no default set.'}
          </p>
        </Field>
        <p className="mt-3 text-sm text-muted-foreground">
          Stock at or below this triggers the low-stock alert and a reorder suggestion
          for this store only.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setReorderTarget(null)}>Cancel</Button>
          <Button loading={saveReorderLevel.isPending} onClick={() => saveReorderLevel.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

/**
 * One suggested order: every low-stock item for a single store + supplier.
 * Groups with no supplier cannot be drafted on their own -- the server reads a
 * missing supplierId as "no filter" and would draft every group -- so they are
 * raised through "Create all drafts" instead.
 */
function ReorderGroupCard({
  group,
  multiStore,
  onDraft,
}: {
  group: ReorderSuggestionGroup;
  multiStore: boolean;
  onDraft: (t: DraftTarget) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {group.supplierName ?? 'No supplier on record'}
          </p>
          <p className="text-xs text-muted-foreground">
            {multiStore && <>{group.storeName} · </>}
            {group.items.length} item{group.items.length !== 1 ? 's' : ''} ·{' '}
            {formatMoney(group.total)}
          </p>
        </div>
        {group.supplierId ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() =>
              onDraft({
                storeId: group.storeId,
                supplierId: group.supplierId!,
                label: `the ${group.items.length}-item order for ${group.supplierName}`,
              })
            }
          >
            Create draft order
          </Button>
        ) : (
          <p className="max-w-xs text-xs text-muted-foreground sm:text-right">
            Never purchased, so there is no supplier to order from. Included in
            &ldquo;Create all drafts&rdquo;.
          </p>
        )}
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Product</TH>
            <TH>SKU</TH>
            <TH className="text-right">On hand</TH>
            <TH className="text-right">Reorder at</TH>
            <TH className="text-right">Order</TH>
            <TH className="text-right">Unit cost</TH>
            <TH className="text-right">Line total</TH>
          </TR>
        </THead>
        <TBody>
          {group.items.map((it) => (
            <TR key={it.productId}>
              <TD className="font-medium">{it.name}</TD>
              <TD className="text-muted-foreground">{it.sku || '—'}</TD>
              <TD className="text-right text-destructive">
                <span className="inline-flex items-center justify-end gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  {it.onHand}
                </span>
              </TD>
              <TD className="text-right text-muted-foreground">{it.reorderLevel}</TD>
              <TD className="text-right font-medium">
                {it.quantity} <span className="text-muted-foreground">{it.unit}</span>
              </TD>
              <TD className="text-right text-muted-foreground">
                {formatMoney(it.costPrice)}
                {!it.lastPurchasedAt && (
                  <Badge tone="muted" className="ml-2">est.</Badge>
                )}
              </TD>
              <TD className="text-right font-medium">
                {formatMoney(it.quantity * it.costPrice)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function StockTable({
  items,
  onAdjust,
  onReorderLevel,
  lowMode,
  showStore,
}: {
  items: StockItem[];
  onAdjust: (i: StockItem) => void;
  onReorderLevel: (i: StockItem) => void;
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
              {showStore && (
                <TD className="text-muted-foreground">{it.store?.name ?? '—'}</TD>
              )}
              <TD className="text-muted-foreground">{it.product.sku || '—'}</TD>
              <TD className="text-right">
                <span className={cn('font-semibold', (lowMode || lowFlag) && 'text-warning')}>
                  {it.quantity}
                </span>
              </TD>
              <TD className="text-right text-muted-foreground">{reorder || '—'}</TD>
              <TD className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Set this store's reorder level"
                    onClick={() => onReorderLevel(it)}
                  >
                    <Target className="h-3.5 w-3.5" /> Reorder level
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onAdjust(it)}>
                    <SlidersHorizontal className="h-3.5 w-3.5" /> Adjust
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

/**
 * Stock → Expiring: what has already expired (to take off the shelf) apart
 * from what expires in the next 30 days (to sell first or discount). Expired
 * rows can be written off in one step -- an EXPIRED adjustment that also
 * empties the batch, so it leaves this list.
 */
function ExpiringTab({ rows, showStore }: { rows: Batch[]; showStore: boolean }) {
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
