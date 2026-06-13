'use client';
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ClipboardList, Trash2 } from 'lucide-react';
import { ProductsApi, PurchasesApi, SuppliersApi } from '@/api';
import { useStores } from '@/hooks/useStores';
import { PageHeader, LoadingBlock, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatMoney, formatDate } from '@/lib/format';

interface Line {
  productId: string;
  quantity: number;
  costPrice: number;
  batchNumber: string;
  expiryDate: string;
}

export default function PurchasesPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const { data: stores } = useStores();
  const [open, setOpen] = useState(false);
  const [storeId, setStoreId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [pickProduct, setPickProduct] = useState('');

  // Inline "create new product" within the receive-stock flow
  const newProductEmpty = { name: '', sku: '', unit: 'pcs', costPrice: 0, sellingPrice: 0 };
  const [newProdOpen, setNewProdOpen] = useState(false);
  const [newProd, setNewProd] = useState(newProductEmpty);
  const cachedNames = useRef<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => PurchasesApi.list({ limit: 50 }),
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

  const create = useMutation({
    mutationFn: () =>
      PurchasesApi.create({
        storeId: storeId || stores?.[0]?.id,
        supplierId: supplierId || undefined,
        reference: reference || undefined,
        receiveNow: true,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          costPrice: l.costPrice,
          batchNumber: l.batchNumber || undefined,
          expiryDate: l.expiryDate || undefined,
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      show('Stock received');
      setOpen(false);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const openNew = () => {
    setStoreId(stores?.[0]?.id ?? '');
    setSupplierId('');
    setReference('');
    setLines([]);
    setOpen(true);
  };

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
      { productId, quantity: 1, costPrice: Number(product.costPrice), batchNumber: '', expiryDate: '' },
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
        { productId: product.id, quantity: 1, costPrice: Number(product.costPrice), batchNumber: '', expiryDate: '' },
      ]);
      // keep the name handy for the line label until products refetch
      cachedNames.current[product.id] = product.name;
      show(`"${product.name}" created`);
      setNewProdOpen(false);
    },
    onError: (e) => show(apiError(e), 'error'),
  });
  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  const productName = (id: string) =>
    products?.data.find((p) => p.id === id)?.name ?? cachedNames.current[id] ?? id;

  return (
    <div>
      <PageHeader title="Purchases" description="Receive stock from suppliers."
        action={<Button onClick={openNew}><Plus className="h-4 w-4" /> Receive stock</Button>} />

      {isLoading ? <LoadingBlock /> :
        !data || data.data.length === 0 ? (
          <EmptyState title="No purchases yet" description="Record a purchase to add stock to your inventory." icon={ClipboardList}
            action={<Button onClick={openNew}><Plus className="h-4 w-4" /> Receive stock</Button>} />
        ) : (
          <Table>
            <THead><TR><TH>Date</TH><TH>Reference</TH><TH>Supplier</TH><TH>Status</TH><TH className="text-right">Items</TH><TH className="text-right">Total</TH></TR></THead>
            <TBody>
              {data.data.map((p) => (
                <TR key={p.id}>
                  <TD className="whitespace-nowrap text-muted-foreground">{formatDate(p.receivedAt || p.createdAt)}</TD>
                  <TD className="font-medium">{p.reference || p.id.slice(-6)}</TD>
                  <TD>{p.supplier?.name ?? '—'}</TD>
                  <TD><Badge tone={p.status === 'RECEIVED' ? 'success' : 'muted'}>{p.status}</Badge></TD>
                  <TD className="text-right">{p._count?.items ?? 0}</TD>
                  <TD className="text-right font-medium">{formatMoney(p.total)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Receive stock" className="max-w-3xl">
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

          {lines.length > 0 && (
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={l.productId} className="rounded-md border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium">{productName(l.productId)}</span>
                    <Button size="icon" variant="ghost" onClick={() => removeLine(i)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Field label="Qty">
                      <Input type="number" min="1" value={l.quantity}
                        onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} />
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
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm text-muted-foreground">Total cost</span>
            <span className="text-lg font-semibold">{formatMoney(total)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={create.isPending} disabled={lines.length === 0} onClick={() => create.mutate()}>
            Receive {lines.length} item{lines.length !== 1 ? 's' : ''}
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU (optional)">
              <Input value={newProd.sku} onChange={(e) => setNewProd((p) => ({ ...p, sku: e.target.value }))} />
            </Field>
            <Field label="Unit">
              <Input value={newProd.unit} onChange={(e) => setNewProd((p) => ({ ...p, unit: e.target.value }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
    </div>
  );
}