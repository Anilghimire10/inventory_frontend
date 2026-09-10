'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ClipboardList, Trash2, Pencil, RotateCcw } from 'lucide-react';
import { ProductsApi, PurchasesApi, SuppliersApi } from '@/api';
import type { Purchase } from '@/types';
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
import { formatMoney, formatDate } from '@/lib/format';
import { hasDuplicateSerials, parseSerials, serialsInvalid } from '@/lib/serials';

interface Line {
  productId: string;
  quantity: number;
  costPrice: number;
  batchNumber: string;
  expiryDate: string;
  /** Raw serial-entry text, kept as typed; parsed into a list only for validation/submit. */
  serialsText: string;
}

export default function PurchasesPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const { data: stores } = useStores();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [storeId, setStoreId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [nameCache, setNameCache] = useState<Record<string, string>>({});
  const [pickProduct, setPickProduct] = useState('');
  // Supplier payment: pay in full now, buy on credit, or pay part now.
  const [payMode, setPayMode] = useState<'full' | 'credit' | 'partial'>('full');
  const [amountPaid, setAmountPaid] = useState(0);

  // Inline "create new product" within the receive-stock flow
  const newProductEmpty = { name: '', sku: '', unit: 'pcs', costPrice: 0, sellingPrice: 0 };
  const [newProdOpen, setNewProdOpen] = useState(false);
  const [newProd, setNewProd] = useState(newProductEmpty);

  // Return-to-supplier flow: loads the full purchase (with per-line returnedQty) on open.
  const [returningPurchase, setReturningPurchase] = useState<Purchase | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returnNote, setReturnNote] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['purchases', page],
    queryFn: () => PurchasesApi.list({ page, limit: 20 }),
  });
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => SuppliersApi.list({ limit: 100 }),
  });
  const { data: products } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => ProductsApi.list({ limit: 100 }),
  });

  const total = useMemo(
    () => lines.reduce((s, l) => s + l.quantity * l.costPrice, 0),
    [lines],
  );

  const productOf = (id: string) => products?.data.find((p) => p.id === id);

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
        supplierId: supplierId || undefined,
        reference: reference || undefined,
        receiveNow: true,
        amountPaid:
          payMode === 'full'
            ? undefined
            : payMode === 'credit'
              ? 0
              : Math.min(Math.max(amountPaid, 0), total),
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          costPrice: l.costPrice,
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
    setSupplierId('');
    setReference('');
    setLines([]);
    setPayMode('full');
    setAmountPaid(0);
    setOpen(true);
  };

  // Load a purchase's full lines and open the dialog in edit mode.
  const openEdit = async (id: string) => {
    try {
      const p = await PurchasesApi.get(id);
      setEditingId(p.id);
      setStoreId(p.store?.id ?? stores?.[0]?.id ?? '');
      setSupplierId(p.supplier?.id ?? '');
      setReference(p.reference ?? '');
      setLines(
        (p.items ?? []).map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          costPrice: Number(it.costPrice),
          batchNumber: it.batchNumber ?? '',
          expiryDate: it.expiryDate ? it.expiryDate.slice(0, 10) : '',
          serialsText: '',
        })),
      );
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
    onSuccess: ({ returnedValue }) => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      show(`Returned ${formatMoney(returnedValue)} to supplier`);
      setReturningPurchase(null);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const returnableOf = (l: { quantity: number; returnedQty: number }) =>
    Math.max(0, Math.round((l.quantity - l.returnedQty) * 1000) / 1000);
  const canReturn = Object.values(returnQtys).some((q) => q > 0);

  const addLine = (productId: string) => {
    if (!productId) return;
    if (productId === '__new__') {
      setNewProd(newProductEmpty);
      setNewProdOpen(true);
      setPickProduct('');
      return;
    }
    const product = products?.data.find((p) => p.id === productId);
    if (!product || lines.some((l) => l.productId === productId)) return;
    setLines((ls) => [
      ...ls,
      { productId, quantity: 1, costPrice: Number(product.costPrice), batchNumber: '', expiryDate: '', serialsText: '' },
    ]);
    setPickProduct('');
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
      setLines((ls) => [
        ...ls,
        { productId: product.id, quantity: 1, costPrice: Number(product.costPrice), batchNumber: '', expiryDate: '', serialsText: '' },
      ]);
      // keep the name handy for the line label until products refetch
      setNameCache((c) => ({ ...c, [product.id]: product.name }));
      show(`"${product.name}" created`);
      setNewProdOpen(false);
    },
    onError: (e) => show(apiError(e), 'error'),
  });
  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  const productName = (id: string) =>
    products?.data.find((p) => p.id === id)?.name ?? nameCache[id] ?? id;

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
                      {outstanding <= 0.001 ? (
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
                          <Button size="icon" variant="ghost" title="Edit purchase" aria-label="Edit purchase"
                            onClick={() => openEdit(p.id)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {p.status === 'RECEIVED' && (
                          <Button size="icon" variant="ghost" title="Return to supplier" aria-label="Return to supplier"
                            onClick={() => openReturn(p.id)}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
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
            {stores && stores.length > 1 && (
              <Field label="Store">
                <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Supplier">
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— None —</option>
                {suppliers?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Reference (optional)">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Invoice #" />
            </Field>
          </div>

          <Field label="Add product">
            <Select value={pickProduct} onChange={(e) => addLine(e.target.value)}>
              <option value="">Select a product to add…</option>
              <option value="__new__">➕ Add a new product…</option>
              {products?.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            {products && products.data.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                No products yet — choose “Add a new product” to create one.
              </p>
            )}
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
                const serials = parseSerials(l.serialsText);
                const mismatch = serialsInvalidFor(l);
                const duplicateSerials = hasDuplicateSerials(serials);
                return (
                <div key={l.productId} className="rounded-md border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium">{productName(l.productId)}</span>
                    <Button size="icon" variant="ghost" onClick={() => removeLine(i)} aria-label={`Remove ${productName(l.productId)}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Field label="Qty">
                      <Input type="number" step={product?.trackSerials ? '1' : '0.001'} min={product?.trackSerials ? '1' : '0.001'} value={l.quantity}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          updateLine(i, { quantity: product?.trackSerials ? Math.round(raw) : raw });
                        }} />
                    </Field>
                    <Field label="Unit cost">
                      <Input type="number" step="0.01" min="0" value={l.costPrice}
                        onChange={(e) => updateLine(i, { costPrice: Number(e.target.value) })} />
                    </Field>
                    <Field label="Batch #">
                      <Input value={l.batchNumber} onChange={(e) => updateLine(i, { batchNumber: e.target.value })} />
                    </Field>
                    <Field label="Expiry">
                      <Input type="date" value={l.expiryDate} onChange={(e) => updateLine(i, { expiryDate: e.target.value })} />
                    </Field>
                  </div>
                  {product?.trackSerials && !editingId && (
                    <div className="mt-2">
                      <Field label={`Serial / IMEI numbers (one per line, ${l.quantity} needed)`}>
                        <textarea
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total cost</span>
              <span className="text-lg font-semibold">{formatMoney(total)}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Supplier payment">
                <Select value={payMode} onChange={(e) => setPayMode(e.target.value as typeof payMode)}>
                  <option value="full">Paid in full now</option>
                  <option value="credit">On credit (pay later)</option>
                  <option value="partial">Partial payment now</option>
                </Select>
              </Field>
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
              <Input value={newProd.unit} onChange={(e) => setNewProd((p) => ({ ...p, unit: e.target.value }))} />
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

      {/* Send received goods back to the supplier: a debit note that shrinks stock and payable. */}
      <Dialog open={!!returningPurchase} onClose={() => setReturningPurchase(null)} title="Return to supplier"
        description={returningPurchase?.reference || returningPurchase?.id.slice(-6)} className="max-w-2xl">
        {returningPurchase && (
          <div className="space-y-4">
            {(returningPurchase.items ?? []).every((l) => returnableOf(l) === 0) ? (
              <p className="text-sm text-muted-foreground">Every line on this purchase has already been fully returned.</p>
            ) : (
              <div className="space-y-2">
                {(returningPurchase.items ?? []).map((l) => {
                  const returnable = returnableOf(l);
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