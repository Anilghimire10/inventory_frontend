'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ClipboardList, Trash2, Pencil, RotateCcw, PackageCheck } from 'lucide-react';
import { ProductsApi, PurchasesApi, SuppliersApi } from '@/api';
import type { Product, Purchase, SettleMethod, Supplier } from '@/types';
import { useActiveStores } from '@/hooks/useStores';
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { UNITS, qtyStep as stepForUnit } from '@/lib/units';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { SearchPicker } from '@/components/SearchPicker';
import { apiError } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { can } from '@/lib/permissions';
import { formatMoney, formatDate } from '@/lib/format';
import { SETTLE_METHODS } from '@/lib/payment-methods';
import { remainingQty } from '@/lib/decimal';
import { hasDuplicateSerials, parseSerials, serialsInvalid } from '@/lib/serials';

/**
 * Full product rows for these ids. The list endpoint caps `limit` at 100, so a
 * long order is fetched in pages. `activeOnly: false` keeps a line whose
 * product was since deactivated resolvable -- an unresolved product would read
 * as non-serialised and let the form skip the serial checks.
 */
async function productsById(ids: string[]): Promise<Record<string, Product>> {
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 100) chunks.push(unique.slice(i, i + 100));
  const pages = await Promise.all(
    chunks.map((c) => ProductsApi.list({ ids: c, limit: 100, activeOnly: false })),
  );
  return Object.fromEntries(pages.flatMap((r) => r.data).map((x) => [x.id, x]));
}

/** Just enough of a store to render one option in the picker. */
type StoreOption = { id: string; name: string; isActive: boolean };

interface Line {
  productId: string;
  quantity: number;
  /** Before VAT. */
  costPrice: number;
  /** VAT % the supplier charged on top; 0 unless "Supplier charged VAT" is ticked. */
  taxRate: number;
  batchNumber: string;
  expiryDate: string;
  /** Raw serial-entry text, kept as typed; parsed into a list only for validation/submit. */
  serialsText: string;
}

export default function PurchasesPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const { data: stores } = useActiveStores();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Set while editing: the store the purchase is already on, so the picker can
  // still show it if it has since been deactivated.
  const [attachedStore, setAttachedStore] = useState<StoreOption | null>(null);
  const [storeId, setStoreId] = useState('');
  const [supplier, setSupplier] = useState<{ id: string; label: string } | null>(null);
  const supplierId = supplier?.id ?? '';
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  // The product behind each line on the form. Lines are picked by searching,
  // so there is no catalog-wide list to look them up in -- and the one there
  // used to be held only the first 100 products by name, so a line past that
  // lost its unit and its serial rules.
  const [lineProducts, setLineProducts] = useState<Record<string, Product>>({});
  // Supplier payment: pay in full now, buy on credit, or pay part now.
  const { user } = useAuth();
  // Stock keepers receive goods; paying for them is left to management, and
  // the API records their purchases on credit whatever is sent.
  const canPay = !!user && can.paySuppliers(user.role);
  const [payMode, setPayMode] = useState<'full' | 'credit' | 'partial'>('full');
  const [amountPaid, setAmountPaid] = useState(0);
  const [payMethod, setPayMethod] = useState<SettleMethod>('CASH');
  // A VAT bill: each line carries its product's VAT on top of the cost, and
  // the Tax report counts it as VAT paid. Off for a supplier who charges none.
  const [vatOn, setVatOn] = useState(false);
  const taxEnabled = user?.business?.taxEnabled ?? true;
  const vatRateOf = (p: Product | undefined) =>
    taxEnabled && p?.isTaxable ? Number(p.taxRate) || 0 : 0;

  // Inline "create new product" within the receive-stock flow
  const newProductEmpty = { name: '', sku: '', unit: 'pcs', costPrice: 0, sellingPrice: 0 };
  const [newProdOpen, setNewProdOpen] = useState(false);
  const [newProd, setNewProd] = useState(newProductEmpty);

  // Receive flow: a draft raised earlier (e.g. from Inventory > Reorder) arriving
  // in the shop. Serials are scanned here rather than when the order was placed,
  // so the dialog needs each line's product to know which ones are serialised.
  const [receivingPurchase, setReceivingPurchase] = useState<Purchase | null>(null);
  const [receiveProducts, setReceiveProducts] = useState<Record<string, Product>>({});
  const [receiveSerials, setReceiveSerials] = useState<Record<string, string>>({});
  const [receiveLoading, setReceiveLoading] = useState(false);

  // Return-to-supplier flow: loads the full purchase (with per-line returnedQty) on open.
  const [returningPurchase, setReturningPurchase] = useState<Purchase | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returnNote, setReturnNote] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['purchases', page],
    queryFn: () => PurchasesApi.list({ page, limit: 20 }),
  });

  // Mirrors purchaseTotals on the server: VAT per line, rounded once.
  const { subtotal, vat, total } = useMemo(() => {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const net = lines.reduce((s, l) => s + l.quantity * l.costPrice, 0);
    const tax = lines.reduce((s, l) => s + (l.quantity * l.costPrice * l.taxRate) / 100, 0);
    return { subtotal: round2(net), vat: round2(tax), total: round2(net) + round2(tax) };
  }, [lines]);
  const toggleVat = (on: boolean) => {
    setVatOn(on);
    setLines((ls) => ls.map((l) => ({ ...l, taxRate: on ? vatRateOf(lineProducts[l.productId]) : 0 })));
  };

  const productOf = (id: string): Product | undefined => lineProducts[id];

  // A serialised line needs exactly one distinct serial per unit before it
  // can be saved. Skipped while editing -- the backend unconditionally
  // refuses to edit a purchase that already has any serial numbers recorded
  // against it (see hasSerializedLineInEdit below), so per-line count
  // validation would only produce a misleading "0 of N entered" message.
  const serialsInvalidFor = (l: Line) => {
    if (editingId) return false;
    const product = productOf(l.productId);
    if (!product?.trackSerials) return false;
    return serialsInvalid(parseSerials(l.serialsText), l.quantity);
  };
  const serialMismatch = lines.some(serialsInvalidFor);
  // Once received, a serialised purchase can never be edited (the backend
  // rejects it outright) -- surface that up front instead of letting the
  // user fill in the form only to hit a confusing error on save.
  const hasSerializedLineInEdit =
    !!editingId && lines.some((l) => productOf(l.productId)?.trackSerials);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        storeId: storeId || stores?.[0]?.id,
        // On an edit, a field left out keeps its old value, so a cleared
        // supplier or reference has to be sent as an explicit null.
        supplierId: supplierId || (editingId ? null : undefined),
        reference: reference || (editingId ? null : undefined),
        receiveNow: true,
        amountPaid: !canPay
          ? 0
          : payMode === 'full'
            ? undefined
            : payMode === 'credit'
              ? 0
              : Math.min(Math.max(amountPaid, 0), total),
        ...(canPay && payMode !== 'credit' ? { paymentMethod: payMethod } : {}),
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          costPrice: l.costPrice,
          taxRate: l.taxRate,
          batchNumber: l.batchNumber || undefined,
          expiryDate: l.expiryDate || undefined,
          serials: productOf(l.productId)?.trackSerials ? parseSerials(l.serialsText) : undefined,
        })),
      };
      return editingId
        ? PurchasesApi.update(editingId, body)
        : PurchasesApi.create(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      show(editingId ? 'Purchase updated' : 'Stock received');
      setOpen(false);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const openNew = () => {
    setEditingId(null);
    setStoreId(stores?.[0]?.id ?? '');
    setSupplier(null);
    setReference('');
    setLines([]);
    setLineProducts({});
    setPayMode('full');
    setAmountPaid(0);
    setPayMethod('CASH');
    setVatOn(false);
    setAttachedStore(null);
    setOpen(true);
  };

  // Load a purchase's full lines and open the dialog in edit mode.
  const openEdit = async (id: string) => {
    try {
      const p = await PurchasesApi.get(id);
      const byId = await productsById((p.items ?? []).map((it) => it.productId));
      setLineProducts(byId);
      setEditingId(p.id);
      setAttachedStore(p.store ? { ...p.store, isActive: false } : null);
      setStoreId(p.store?.id ?? stores?.[0]?.id ?? '');
      setSupplier(p.supplier ? { id: p.supplier.id, label: p.supplier.name } : null);
      setReference(p.reference ?? '');
      setLines(
        (p.items ?? []).map((it) => ({
          productId: it.productId,
          quantity: Number(it.quantity),
          costPrice: Number(it.costPrice),
          taxRate: Number(it.taxRate ?? 0),
          batchNumber: it.batchNumber ?? '',
          expiryDate: it.expiryDate ? it.expiryDate.slice(0, 10) : '',
          serialsText: '',
        })),
      );
      setVatOn((p.items ?? []).some((it) => Number(it.taxRate ?? 0) > 0));
      setPayMethod('CASH');
      const paid = Number(p.amountPaid);
      const tot = Number(p.total);
      if (paid >= tot) setPayMode('full');
      else if (paid <= 0) setPayMode('credit');
      else {
        setPayMode('partial');
        setAmountPaid(paid);
      }
      setOpen(true);
    } catch (e) {
      show(apiError(e), 'error');
    }
  };

  const openReceive = async (id: string) => {
    setReceiveLoading(true);
    try {
      const p = await PurchasesApi.get(id);
      // An unresolved product would read as non-serialised, which would let
      // Receive enable and then fail server-side.
      setReceiveProducts(await productsById((p.items ?? []).map((l) => l.productId)));
      setReceiveSerials({});
      setReceivingPurchase(p);
    } catch (e) {
      show(apiError(e), 'error');
    } finally {
      setReceiveLoading(false);
    }
  };

  const receiveMutation = useMutation({
    mutationFn: () =>
      PurchasesApi.receive(receivingPurchase!.id, {
        items: (receivingPurchase!.items ?? [])
          .filter((l) => receiveProducts[l.productId]?.trackSerials)
          .map((l) => ({
            purchaseItemId: l.id,
            serials: parseSerials(receiveSerials[l.id] ?? ''),
          })),
      }),
    onSuccess: () => {
      // Receiving moves stock, batches and the serial register all at once.
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      qc.invalidateQueries({ queryKey: ['serials'] });
      qc.invalidateQueries({ queryKey: ['reorder-suggestions'] });
      show('Stock received');
      setReceivingPurchase(null);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const receiveLineInvalid = (l: { id: string; quantity: string; productId: string }) =>
    receiveProducts[l.productId]?.trackSerials
      ? serialsInvalid(parseSerials(receiveSerials[l.id] ?? ''), Number(l.quantity))
      : false;
  const canReceive = (receivingPurchase?.items ?? []).every((l) => !receiveLineInvalid(l));

  const openReturn = async (id: string) => {
    try {
      const p = await PurchasesApi.get(id);
      setReturningPurchase(p);
      setReturnQtys({});
      setReturnNote('');
    } catch (e) {
      show(apiError(e), 'error');
    }
  };

  const returnMutation = useMutation({
    mutationFn: () =>
      PurchasesApi.return(returningPurchase!.id, {
        note: returnNote || undefined,
        items: Object.entries(returnQtys)
          .filter(([, qty]) => qty > 0)
          .map(([purchaseItemId, quantity]) => ({ purchaseItemId, quantity })),
      }),
    onSuccess: ({ returnedValue, refundDueFromSupplier }) => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      qc.invalidateQueries({ queryKey: ['credit'] });
      show(
        refundDueFromSupplier > 0
          ? `Returned ${formatMoney(returnedValue)} to supplier — they owe you ${formatMoney(refundDueFromSupplier)} back (Credit → Supplier refunds)`
          : `Returned ${formatMoney(returnedValue)} to supplier`,
      );
      setReturningPurchase(null);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  // The picker offers active stores, but an existing purchase may be attached to
  // one that has since been deactivated — keep that one listed so editing it
  // doesn't silently move the purchase to another store.
  const storeOptions = useMemo<StoreOption[]>(() => {
    const active = stores ?? [];
    if (!attachedStore || active.some((s) => s.id === attachedStore.id)) return active;
    return [...active, attachedStore];
  }, [stores, attachedStore]);

  const canReturn = Object.values(returnQtys).some((q) => q > 0);

  const addLine = (product: Product | null) => {
    if (!product || lines.some((l) => l.productId === product.id)) return;
    setLineProducts((m) => ({ ...m, [product.id]: product }));
    setLines((ls) => [
      ...ls,
      {
        productId: product.id,
        quantity: 1,
        costPrice: Number(product.costPrice),
        taxRate: vatOn ? vatRateOf(product) : 0,
        batchNumber: '',
        expiryDate: '',
        serialsText: '',
      },
    ]);
  };

  // Create a product on the fly, then add it as a purchase line.
  const createProduct = useMutation({
    mutationFn: () =>
      ProductsApi.create({
        name: newProd.name,
        sku: newProd.sku || undefined,
        unit: newProd.unit || 'pcs',
        costPrice: newProd.costPrice,
        sellingPrice: newProd.sellingPrice,
      }),
    onSuccess: (product) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      addLine(product);
      show(`"${product.name}" created`);
      setNewProdOpen(false);
    },
    onError: (e) => show(apiError(e), 'error'),
  });
  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  const productName = (id: string) => lineProducts[id]?.name ?? id;

  return (
    <div>
      <PageHeader title="Purchases" description="Receive stock from suppliers."
        action={<Button onClick={openNew}><Plus className="h-4 w-4" /> Receive stock</Button>} />

      {isError ? <ErrorState onRetry={() => refetch()} /> :
        isLoading ? <LoadingBlock /> :
        !data || data.data.length === 0 ? (
          <EmptyState title="No purchases yet" description="Record a purchase to add stock to your inventory." icon={ClipboardList}
            action={<Button onClick={openNew}><Plus className="h-4 w-4" /> Receive stock</Button>} />
        ) : (
          <>
          <Table>
            <THead><TR><TH>Date</TH><TH>Reference</TH><TH>Supplier</TH><TH>Status</TH><TH>Payment</TH><TH className="text-right">Items</TH><TH className="text-right">Total</TH><TH></TH></TR></THead>
            <TBody>
              {data.data.map((p) => {
                const outstanding = p.outstanding ?? Number(p.total) - Number(p.amountPaid);
                return (
                  <TR key={p.id}>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDate(p.receivedAt || p.createdAt)}</TD>
                    <TD className="font-medium">{p.reference || p.id.slice(-6)}</TD>
                    <TD>{p.supplier?.name ?? '—'}</TD>
                    <TD><Badge tone={p.status === 'RECEIVED' ? 'success' : 'muted'}>{p.status}</Badge></TD>
                    <TD>
                      {Number(p.refundDue ?? 0) > 0 ? (
                        <Badge tone="warning">Owes you {formatMoney(p.refundDue!)}</Badge>
                      ) : outstanding <= 0.001 ? (
                        <Badge tone="success">Paid</Badge>
                      ) : Number(p.amountPaid) > 0 ? (
                        <Badge tone="warning">Owing {formatMoney(outstanding)}</Badge>
                      ) : (
                        <Badge tone="destructive">On credit</Badge>
                      )}
                    </TD>
                    <TD className="text-right">{p._count?.items ?? 0}</TD>
                    <TD className="text-right font-medium">{formatMoney(p.total)}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end">
                        {p.status !== 'CANCELLED' && (
                          <Tooltip content="Edit purchase">
                            <Button size="icon" variant="ghost" aria-label="Edit purchase"
                              onClick={() => openEdit(p.id)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </Tooltip>
                        )}
                        {(p.status === 'DRAFT' || p.status === 'ORDERED') && (
                          <Tooltip content="Receive stock">
                            <Button size="icon" variant="ghost" aria-label="Receive stock"
                              disabled={receiveLoading}
                              onClick={() => openReceive(p.id)}>
                              <PackageCheck className="h-4 w-4" />
                            </Button>
                          </Tooltip>
                        )}
                        {p.status === 'RECEIVED' && (
                          <Tooltip content="Return to supplier">
                            <Button size="icon" variant="ghost" aria-label="Return to supplier"
                              onClick={() => openReturn(p.id)}>
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination page={data.meta.page} pages={data.meta.pages} onPage={setPage} />
          </>
        )}

      <Dialog open={open} onClose={() => setOpen(false)} title={editingId ? 'Edit purchase' : 'Receive stock'} className="max-w-3xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {stores && storeOptions.length > 1 && (
              <Field label="Store">
                <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                  {storeOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{!s.isActive && ' (deactivated)'}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Supplier">
              <SearchPicker<Supplier>
                queryKey={['suppliers', 'pick']}
                fetchPage={(search, limit) => SuppliersApi.list({ search: search || undefined, limit })}
                label={(s) => s.name}
                detail={(s) => s.phone}
                selected={supplier}
                noneLabel="— None —"
                onPick={(s) => setSupplier(s ? { id: s.id, label: s.name } : null)}
                placeholder="Search suppliers…"
                aria-label="Supplier"
              />
            </Field>
            <Field label="Reference (optional)">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Invoice #" />
            </Field>
          </div>

          <Field label="Add product">
            <div className="flex flex-col gap-2 sm:flex-row">
              <SearchPicker<Product>
                className="flex-1"
                queryKey={['products', 'pick']}
                fetchPage={(search, limit) => ProductsApi.list({ search: search || undefined, limit })}
                label={(p) => p.name}
                detail={(p) => p.sku}
                isTaken={(p) => lines.some((l) => l.productId === p.id)}
                onPick={addLine}
                placeholder="Search by name, SKU or barcode…"
                aria-label="Add product"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setNewProd(newProductEmpty);
                  setNewProdOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> New product
              </Button>
            </div>
          </Field>

          {hasSerializedLineInEdit && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
              This purchase has serial numbers already recorded and can&apos;t be edited —
              return items to the supplier instead.
            </p>
          )}

          {lines.length > 0 && (
            <div className="space-y-2">
              {lines.map((l, i) => {
                const product = productOf(l.productId);
                const qtyStep = product?.trackSerials ? '1' : stepForUnit(product?.unit);
                const serials = parseSerials(l.serialsText);
                const mismatch = serialsInvalidFor(l);
                const duplicateSerials = hasDuplicateSerials(serials);
                return (
                <div key={l.productId} className="rounded-md border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium">{productName(l.productId)}</span>
                    <Tooltip content="Remove line">
                      <Button size="icon" variant="ghost" onClick={() => removeLine(i)} aria-label={`Remove ${productName(l.productId)}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </Tooltip>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Field label={`Qty (${product?.unit ?? 'pcs'})`}>
                      <Input type="number" step={qtyStep} min={qtyStep} value={l.quantity}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          updateLine(i, { quantity: qtyStep === '1' ? Math.round(raw) : raw });
                        }} />
                    </Field>
                    <Field label={l.taxRate > 0 ? `Unit cost (+${l.taxRate}% VAT)` : 'Unit cost'}>
                      <Input type="number" step="0.01" min="0" value={l.costPrice}
                        onChange={(e) => updateLine(i, { costPrice: Number(e.target.value) })} />
                    </Field>
                    {/* Only batch-tracked products keep batches: a sale draws
                        those down. Any other product's expiry is kept on the
                        product itself. */}
                    {product?.trackBatches && (
                      <Field label="Batch #">
                        <Input value={l.batchNumber} onChange={(e) => updateLine(i, { batchNumber: e.target.value })} />
                      </Field>
                    )}
                    <Field label={product?.trackBatches ? 'Expiry' : 'Expiry (optional)'}>
                      <Input type="date" value={l.expiryDate} onChange={(e) => updateLine(i, { expiryDate: e.target.value })} />
                    </Field>
                  </div>
                  {product?.trackSerials && !editingId && (
                    <div className="mt-2">
                      <Field label={`Serial / IMEI numbers (one per line, ${l.quantity} needed)`}>
                        <Textarea
                          rows={3}
                          value={l.serialsText}
                          onChange={(e) => updateLine(i, { serialsText: e.target.value })}
                        />
                      </Field>
                      {mismatch && (
                        <p className="mt-1 text-xs text-destructive">
                          {!Number.isInteger(l.quantity) || l.quantity < 1
                            ? 'Quantity must be a whole number of at least 1 for serialised products.'
                            : duplicateSerials
                              ? 'Duplicate serial numbers entered.'
                              : `${serials.length} of ${l.quantity} serials entered.`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}

          <div className="space-y-3 border-t border-border pt-3">
            {taxEnabled && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={vatOn} onChange={(e) => toggleVat(e.target.checked)} />
                Supplier charged VAT
                <span className="text-xs text-muted-foreground">— enter costs before VAT</span>
              </label>
            )}
            {vat > 0 && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Goods</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">VAT</span>
                  <span>{formatMoney(vat)}</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total cost</span>
              <span className="text-lg font-semibold">{formatMoney(total)}</span>
            </div>
            {canPay ? (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Supplier payment">
                    <Select value={payMode} onChange={(e) => setPayMode(e.target.value as typeof payMode)}>
                      <option value="full">Paid in full now</option>
                      <option value="credit">On credit (pay later)</option>
                      <option value="partial">Partial payment now</option>
                    </Select>
                  </Field>
                  {payMode !== 'credit' && (
                    <Field label="Paid by">
                      <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as SettleMethod)}>
                        {SETTLE_METHODS.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  {payMode === 'partial' && (
                    <Field label="Amount paid now">
                      <Input type="number" step="0.01" min="0" max={total} value={amountPaid}
                        onChange={(e) =>
                          setAmountPaid(Math.min(Math.max(Number(e.target.value) || 0, 0), total))
                        } />
                    </Field>
                  )}
                </div>
                {payMode !== 'full' && (
                  <p className="text-xs text-muted-foreground">
                    Outstanding{' '}
                    <span className="font-medium text-foreground">
                      {formatMoney(Math.max(0, total - (payMode === 'credit' ? 0 : amountPaid)))}
                    </span>{' '}
                    will appear under Credit → Payables.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Recorded on credit. An owner or manager records the payment
                under Credit → Payables.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={save.isPending} disabled={lines.length === 0 || serialMismatch || hasSerializedLineInEdit} onClick={() => save.mutate()}>
            {editingId
              ? 'Save changes'
              : `Receive ${lines.length} item${lines.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Quick-create a product without leaving the purchase */}
      <Dialog open={newProdOpen} onClose={() => setNewProdOpen(false)} title="New product"
        description="It will be added to your catalog and this purchase.">
        <form onSubmit={(e) => { e.preventDefault(); createProduct.mutate(); }} className="space-y-4">
          <Field label="Name">
            <Input value={newProd.name} onChange={(e) => setNewProd((p) => ({ ...p, name: e.target.value }))} required autoFocus />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="SKU (optional)">
              <Input value={newProd.sku} onChange={(e) => setNewProd((p) => ({ ...p, sku: e.target.value }))} />
            </Field>
            <Field label="Unit">
              <Select value={newProd.unit} onChange={(e) => setNewProd((p) => ({ ...p, unit: e.target.value }))}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Cost price">
              <Input type="number" step="0.01" min="0" value={newProd.costPrice}
                onChange={(e) => setNewProd((p) => ({ ...p, costPrice: Number(e.target.value) }))} />
            </Field>
            <Field label="Selling price">
              <Input type="number" step="0.01" min="0" value={newProd.sellingPrice}
                onChange={(e) => setNewProd((p) => ({ ...p, sellingPrice: Number(e.target.value) }))} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: you can fine-tune category, tax, batch tracking, and Rx settings later on the Products page.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewProdOpen(false)}>Cancel</Button>
            <Button type="submit" loading={createProduct.isPending}>Create & add</Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Goods from a draft order arriving: adds stock, and scans serials per line. */}
      <Dialog open={!!receivingPurchase} onClose={() => setReceivingPurchase(null)} title="Receive stock"
        description={
          receivingPurchase
            ? `${receivingPurchase.supplier?.name ?? 'No supplier'} · ${formatDate(receivingPurchase.createdAt)}`
            : undefined
        }
        className="max-w-2xl">
        {receivingPurchase && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This adds every line below to stock at{' '}
              {receivingPurchase.store?.name ?? 'the store'} and marks the order received.
              It can only be done once.
            </p>
            <div className="space-y-2">
              {(receivingPurchase.items ?? []).map((l) => {
                const product = receiveProducts[l.productId];
                const serialised = !!product?.trackSerials;
                const serials = parseSerials(receiveSerials[l.id] ?? '');
                const duplicate = hasDuplicateSerials(serials);
                const invalid = receiveLineInvalid(l);
                return (
                  <div key={l.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">
                        {l.product?.name ?? product?.name ?? l.productId}
                      </span>
                      <span className="shrink-0 text-sm text-muted-foreground">
                        {l.quantity} × {formatMoney(l.costPrice)}
                      </span>
                    </div>
                    {serialised && (
                      <div className="mt-3">
                        <Field label={`Serial / IMEI numbers (one per line, ${l.quantity} needed)`}>
                          <Textarea
                            rows={Math.min(Number(l.quantity) || 1, 6)}
                            value={receiveSerials[l.id] ?? ''}
                            onChange={(e) =>
                              setReceiveSerials((m) => ({ ...m, [l.id]: e.target.value }))
                            }
                          />
                          <p className={invalid ? 'mt-1 text-xs text-destructive' : 'mt-1 text-xs text-muted-foreground'}>
                            {!Number.isInteger(Number(l.quantity))
                              ? 'Quantity must be a whole number for serialised products.'
                              : duplicate
                                ? 'Duplicate serial numbers entered.'
                                : `${serials.length} of ${l.quantity} serials entered.`}
                          </p>
                        </Field>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setReceivingPurchase(null)}>Cancel</Button>
          <Button loading={receiveMutation.isPending} disabled={!canReceive}
            onClick={() => receiveMutation.mutate()}>
            Receive stock
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Send received goods back to the supplier: a debit note that shrinks stock and payable. */}
      <Dialog open={!!returningPurchase} onClose={() => setReturningPurchase(null)} title="Return to supplier"
        description={returningPurchase?.reference || returningPurchase?.id.slice(-6)} className="max-w-2xl">
        {returningPurchase && (
          <div className="space-y-4">
            {(returningPurchase.items ?? []).every((l) => remainingQty(l) === 0) ? (
              <p className="text-sm text-muted-foreground">Every line on this purchase has already been fully returned.</p>
            ) : (
              <div className="space-y-2">
                {(returningPurchase.items ?? []).map((l) => {
                  const returnable = remainingQty(l);
                  if (returnable === 0) return null;
                  const qty = returnQtys[l.id] ?? 0;
                  return (
                    <div key={l.id} className="flex items-center gap-3 rounded-md border border-border p-3">
                      <div className="flex-1">
                        <span className="font-medium">{l.product?.name ?? l.productId}</span>
                        <p className="text-xs text-muted-foreground">
                          Purchased {l.quantity} · returned {l.returnedQty} · {returnable} left
                        </p>
                      </div>
                      <Input type="number" step="0.001" min="0" max={returnable} className="w-28"
                        value={qty}
                        onChange={(e) => {
                          const v = Math.min(Math.max(Number(e.target.value) || 0, 0), returnable);
                          setReturnQtys((q) => ({ ...q, [l.id]: v }));
                        }} />
                    </div>
                  );
                })}
              </div>
            )}
            <Field label="Reason (optional)">
              <Input value={returnNote} onChange={(e) => setReturnNote(e.target.value)} placeholder="Damaged, wrong item, etc." />
            </Field>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setReturningPurchase(null)}>Cancel</Button>
          <Button loading={returnMutation.isPending} disabled={!canReturn} onClick={() => returnMutation.mutate()}>
            Return to supplier
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}