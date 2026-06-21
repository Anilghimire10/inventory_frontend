'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Minus, ShoppingCart, X, Printer, Package } from 'lucide-react';
import { CustomersApi, ProductsApi, SalesApi } from '@/api';
import type { Product } from '@/types';
import { useAuth } from '@/auth/AuthContext';
import { printSale } from '@/lib/print';
import { PageHeader } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

interface CartLine {
  product: Product;
  quantity: number;
}

export default function PosPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const { user } = useAuth();
  // Master tax switch (from business settings). When off, nothing is taxed.
  const taxEnabled = user?.business?.taxEnabled ?? true;
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  // Pay in full now, leave it all on credit, or pay part now (rest to credit).
  const [payMode, setPayMode] = useState<'full' | 'partial' | 'credit'>('full');
  const [amountPaid, setAmountPaid] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [prescriptionRef, setPrescriptionRef] = useState('');
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);

  const { data: products } = useQuery({
    queryKey: ['pos-products', search],
    queryFn: () => ProductsApi.list({ search: search || undefined, limit: 50 }),
  });
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => CustomersApi.list({ limit: 100 }),
  });

  const needsRx = cart.some((l) => l.product.isRxRequired);

  const { subtotal, tax, total } = useMemo(() => {
    let sub = 0, t = 0;
    for (const l of cart) {
      const net = Number(l.product.sellingPrice) * l.quantity;
      sub += net;
      // Tax applies only when the master switch is on AND the product is taxable.
      if (taxEnabled && l.product.isTaxable) t += (net * Number(l.product.taxRate)) / 100;
    }
    sub = Math.round(sub * 100) / 100;
    t = Math.round(t * 100) / 100;
    return { subtotal: sub, tax: t, total: Math.max(0, Math.round((sub + t - discount) * 100) / 100) };
  }, [cart, discount, taxEnabled]);

  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);

  // How much is collected now vs. left on the customer's account.
  const paidNow =
    payMode === 'full' ? total : payMode === 'credit' ? 0 : Math.min(amountPaid, total);
  const due = Math.max(0, Math.round((total - paidNow) * 100) / 100);

  const checkout = useMutation({
    mutationFn: () =>
      SalesApi.create({
        customerId: customerId || undefined,
        // Fully on credit -> CREDIT; otherwise the chosen tender (server marks
        // a part-paid sale as MIXED). amountPaid drives the credit split.
        paymentMethod: payMode === 'credit' ? 'CREDIT' : paymentMethod,
        amountPaid: payMode === 'full' ? undefined : paidNow,
        discount: discount || undefined,
        prescriptionRef: prescriptionRef || undefined,
        items: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      }),
    onSuccess: (sale) => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['credit'] });
      show(`Sale ${sale.receiptNo} completed`);
      setLastSaleId(sale.id);
      setCart([]);
      setDiscount(0);
      setCustomerId('');
      setPrescriptionRef('');
      setPaymentMethod('CASH');
      setPayMode('full');
      setAmountPaid(0);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const add = (product: Product) =>
    setCart((c) => {
      const found = c.find((l) => l.product.id === product.id);
      if (found) return c.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...c, { product, quantity: 1 }];
    });
  const setQty = (id: string, qty: number) =>
    setCart((c) =>
      qty <= 0 ? c.filter((l) => l.product.id !== id) : c.map((l) => (l.product.id === id ? { ...l, quantity: qty } : l)),
    );

  // Barcode scan (or Enter): look up an exact barcode and add it to the cart.
  const scan = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = search.trim();
    if (!code) return;
    // Prefer an exact barcode match already in the loaded list.
    const local = products?.data.find((p) => p.barcode === code);
    if (local) { add(local); setSearch(''); return; }
    try {
      const product = await ProductsApi.byBarcode(code);
      add(product);
      setSearch('');
    } catch {
      // Not a known barcode — leave the text as a normal search filter.
    }
  };

  const printLast = async () => {
    if (!lastSaleId) return;
    try {
      const full = await SalesApi.get(lastSaleId);
      printSale(full, 'thermal');
    } catch (e) {
      show(apiError(e), 'error');
    }
  };

  return (
    <div>
      <PageHeader title="Point of Sale" description="Ring up a sale." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Product picker */}
        <div className="lg:col-span-3">
          <div className="mb-4 flex items-center gap-2">
            <form onSubmit={scan} className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search or scan barcode…" value={search}
                onChange={(e) => setSearch(e.target.value)} autoFocus />
            </form>
            {lastSaleId && (
              <Button variant="outline" onClick={printLast} title="Print the last sale's receipt">
                <Printer className="h-4 w-4" /> Last receipt
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {products?.data.map((p) => (
              <button key={p.id} onClick={() => add(p)}
                className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md active:translate-y-0 active:scale-[0.98]">
                <div className="relative aspect-[4/3] w-full bg-muted">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Package className="h-7 w-7" />
                    </div>
                  )}
                  {p.isRxRequired && (
                    <span className="absolute right-1.5 top-1.5"><Badge tone="destructive">Rx</Badge></span>
                  )}
                </div>
                <div className="p-3">
                  <span className="line-clamp-2 text-sm font-medium">{p.name}</span>
                  <div className="mt-1 font-semibold text-primary">{formatMoney(p.sellingPrice)}</div>
                  <div className="text-xs text-muted-foreground">{p.sku || p.unit}</div>
                </div>
              </button>
            ))}
            {products && products.data.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No products found.</p>
            )}
          </div>
        </div>

        {/* Cart */}
        <div className="lg:col-span-2">
          <Card className="sticky top-20 flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-3">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Cart</h2>
              {cartCount > 0 && (
                <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {cartCount} item{cartCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Scrollable middle: line items + payment options */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <ShoppingCart className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium">Your cart is empty</p>
                  <p className="text-xs text-muted-foreground">Tap a product on the left to add it.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {cart.map((l) => (
                    <li key={l.product.id} className="flex items-center gap-3 px-4 py-3">
                      {l.product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={l.product.imageUrl} alt={l.product.name}
                          className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                          <Package className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="truncate text-sm font-medium">{l.product.name}</span>
                          {l.product.isRxRequired && <Badge tone="destructive">Rx</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatMoney(l.product.sellingPrice)} · {formatMoney(Number(l.product.sellingPrice) * l.quantity)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7"
                          onClick={() => setQty(l.product.id, l.quantity - 1)}><Minus className="h-3 w-3" /></Button>
                        <input className="h-7 w-10 rounded border border-input bg-background text-center text-sm"
                          value={l.quantity}
                          onChange={(e) => setQty(l.product.id, parseInt(e.target.value) || 0)} />
                        <Button size="icon" variant="outline" className="h-7 w-7"
                          onClick={() => setQty(l.product.id, l.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setQty(l.product.id, 0)}>
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {cart.length > 0 && (
                <div className="space-y-3 border-t border-border p-4">
                  {needsRx && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                      <Field label="Prescription reference (required)">
                        <Input value={prescriptionRef} onChange={(e) => setPrescriptionRef(e.target.value)}
                          placeholder="Rx number" />
                      </Field>
                      <p className="pt-1.5 text-xs text-muted-foreground">
                        Required for: {cart.filter((l) => l.product.isRxRequired).map((l) => l.product.name).join(', ')}.
                        One reference covers all prescription items on this sale.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Customer">
                      <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                        <option value="">Walk-in</option>
                        {customers?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Payment">
                      <Select value={payMode} onChange={(e) => setPayMode(e.target.value as typeof payMode)}>
                        <option value="full">Paid in full</option>
                        <option value="partial">Partial (rest on credit)</option>
                        <option value="credit">Full credit (on account)</option>
                      </Select>
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {payMode !== 'credit' && (
                      <Field label="Tender">
                        <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                          <option value="CASH">Cash</option>
                          <option value="CARD">Card</option>
                          <option value="MOBILE">Mobile</option>
                        </Select>
                      </Field>
                    )}
                    {payMode === 'partial' && (
                      <Field label="Amount paid now">
                        <Input type="number" step="0.01" min="0" max={total} value={amountPaid}
                          onChange={(e) => setAmountPaid(Number(e.target.value) || 0)} />
                      </Field>
                    )}
                    <Field label="Discount">
                      <Input type="number" step="0.01" min="0" value={discount}
                        onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
                    </Field>
                  </div>
                </div>
              )}
            </div>

            {/* Pinned totals + checkout */}
            {cart.length > 0 && (
              <div className="space-y-3 border-t border-border bg-muted/30 p-4">
                <div className="space-y-1 text-sm">
                  <Row label="Subtotal" value={formatMoney(subtotal)} />
                  <Row label="Tax" value={formatMoney(tax)} />
                  {discount > 0 && <Row label="Discount" value={`- ${formatMoney(discount)}`} />}
                  <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                    <span>Total</span><span className="text-primary">{formatMoney(total)}</span>
                  </div>
                  {due > 0 && (
                    <div className="flex justify-between font-medium text-destructive">
                      <span>On credit (due)</span><span>{formatMoney(due)}</span>
                    </div>
                  )}
                </div>

                <Button className="w-full" size="lg" loading={checkout.isPending}
                  disabled={(due > 0 && !customerId) || (needsRx && !prescriptionRef.trim())}
                  onClick={() => checkout.mutate()}>
                  Complete sale · {formatMoney(total)}
                </Button>
                {due > 0 && !customerId && (
                  <p className="text-center text-xs text-destructive">Select a customer to leave a balance on credit.</p>
                )}
                {needsRx && !prescriptionRef.trim() && (
                  <p className="text-center text-xs text-destructive">Enter a prescription reference to continue.</p>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn('flex justify-between text-muted-foreground')}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}