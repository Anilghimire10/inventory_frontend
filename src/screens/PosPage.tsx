'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Minus,
  ShoppingCart,
  X,
  Printer,
  Package,
  Barcode,
  ClipboardPlus,
  Pause,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { CategoriesApi, CustomersApi, InventoryApi, ProductsApi, SalesApi } from '@/api';
import type { Product, Paginated, StockItem } from '@/types';
import { useAuth } from '@/auth/AuthContext';
import { printSale } from '@/lib/print';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { RxBadge } from '@/components/ui/RxBadge';
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
  const [categoryId, setCategoryId] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [heldCart, setHeldCart] = useState<CartLine[] | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  // Pay in full now, leave it all on credit, or pay part now (rest to credit).
  const [payMode, setPayMode] = useState<'full' | 'partial' | 'credit'>('full');
  const [amountPaid, setAmountPaid] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [prescriptionRef, setPrescriptionRef] = useState('');
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);

  // Keep the newest line item in view as the sale grows.
  const cartScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = cartScrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [cart]);

  const { data: products } = useQuery({
    queryKey: ['pos-products', search],
    queryFn: () => ProductsApi.list({ search: search || undefined, limit: 50 }),
  });
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => CustomersApi.list({ limit: 100 }),
  });
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => CategoriesApi.list(),
  });
  // Total on-hand quantity per product (summed across all stores), fetched in
  // pages because the API caps limit at 100.
  const { data: stock } = useQuery({
    queryKey: ['pos-stock'],
    queryFn: async () => {
      const all: StockItem[] = [];
      let page = 1;
      for (;;) {
        const res = await InventoryApi.stock({ limit: 100, page });
        all.push(...(res.data ?? []));
        const total = res.meta?.total ?? all.length;
        if (all.length >= total) break;
        page++;
      }
      return { data: all } as Paginated<StockItem>;
    },
  });

  // Total on-hand quantity per product (summed across all stores).
  const onHand = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stock?.data ?? []) {
      m.set(s.productId, (m.get(s.productId) ?? 0) + s.quantity);
    }
    return m;
  }, [stock]);

  const filteredProducts = useMemo(() => {
    const list = products?.data ?? [];
    if (!categoryId) return list;
    return list.filter((p) => p.categories?.some((c) => c.id === categoryId));
  }, [products, categoryId]);

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

  const resetSaleState = () => {
    setDiscount(0);
    setCustomerId('');
    setPrescriptionRef('');
    setPaymentMethod('CASH');
    setPayMode('full');
    setAmountPaid(0);
  };

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
      setHeldCart(null);
      resetSaleState();
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

  // Hold the current sale aside and start a fresh cart; Resume brings it back.
  const hold = () => {
    if (cart.length === 0) return;
    setHeldCart(cart);
    setCart([]);
    resetSaleState();
  };
  const resume = () => {
    if (heldCart) setCart(heldCart);
    setHeldCart(null);
  };
  const clear = () => {
    setCart([]);
    setHeldCart(null);
    resetSaleState();
  };

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
    <div className="flex h-[calc(100vh-6rem)] flex-col lg:h-[calc(100vh-7rem)]">
      {/* Header — register + last-receipt print */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Point of Sale</h1>
        <div className="ml-auto flex items-center gap-2">
          {lastSaleId && (
            <Button variant="outline" size="sm" onClick={printLast} title="Print the last sale's receipt">
              <Printer className="h-4 w-4" /> Last receipt
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* Product picker (55%) */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:w-[55%]">
          <form onSubmit={scan} className="relative">
            <Input
              className="h-11 pr-10"
              placeholder="Search products, SKUs, or scan a barcode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <Barcode className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          </form>

          {/* Category filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Chip active={categoryId === ''} onClick={() => setCategoryId('')}>
              All
            </Chip>
            {categories?.map((c) => (
              <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((p) => {
                const available = onHand.get(p.id) ?? 0;
                const out = available <= 0;
                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={out ? -1 : 0}
                    onClick={out ? undefined : () => add(p)}
                    onKeyDown={out ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(p); } }}
                    className={cn(
                      'group flex cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all focus-visible:outline-2 focus-visible:outline-ring outline-offset-1',
                      out ? 'cursor-default opacity-50' : 'hover:border-primary/50 hover:shadow-md',
                    )}
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-muted">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className={cn(
                            'h-full w-full object-cover transition-transform duration-300',
                            !out && 'group-hover:scale-105',
                          )}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <Package className="h-7 w-7" />
                        </div>
                      )}
                      {out && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                          <span className="rounded-full bg-background px-2 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                            Out of stock
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5 p-4">
                      <div className="flex items-start gap-1">
                        <span className="line-clamp-2 flex-1 text-base font-medium">{p.name}</span>
                        {p.isRxRequired && <RxBadge />}
                      </div>
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <span className="text-base font-bold text-primary">{formatMoney(p.sellingPrice)}</span>
                        <button
                          disabled={out}
                          onClick={(e) => { e.stopPropagation(); add(p); }}
                          aria-label={`Add ${p.name}`}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40"
                        >
                          <Plus className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="text-sm text-muted-foreground">{p.sku || p.unit}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {filteredProducts.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No products found.</p>
            )}
          </div>
        </div>

        {/* Cart (45%) */}
        <div className="flex min-h-0 flex-col lg:w-[45%]">
          <Card className={cn(
            'flex min-h-0 flex-1 flex-col overflow-hidden transition-colors',
            cartCount > 0
              ? 'border-primary'
              : 'border-border hover:border-primary',
          )}>
            <div className="flex items-center gap-2 border-b border-primary/30 bg-muted/30 px-4 py-3">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Current Sale</h2>
              {cartCount > 0 && (
                <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {cartCount} item{cartCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Whole sale content scrolls together (header stays pinned) */}
            <div ref={cartScrollRef} className="min-h-0 flex-1 overflow-y-auto">
            {heldCart && cart.length === 0 && (
              <div className="flex items-center gap-2 border-b border-warning/40 bg-warning/10 px-4 py-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                <p className="flex-1 text-xs font-medium">A sale is on hold</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-warning/50 text-warning hover:bg-warning/10"
                  onClick={resume}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Resume
                </Button>
              </div>
            )}

            {/* Customer selector — always at the top of the sale */}
            <div className="border-b border-border px-4 py-3">
              <Field label="Customer">
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Walk-in</option>
                  {customers?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
            </div>

            {/* Line items */}
            <div>
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
                    <li key={l.product.id} className="flex items-center gap-4 px-4 py-5">
                      {l.product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={l.product.imageUrl} alt={l.product.name}
                          className="h-16 w-16 shrink-0 rounded-md border border-border object-cover" />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                          <Package className="h-6 w-6" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="truncate text-lg font-medium">{l.product.name}</span>
                          {l.product.isRxRequired && <RxBadge />}
                        </div>
                        <div className="text-sm text-muted-foreground">{l.product.sku || l.product.unit}</div>
                        <div className="mt-3 flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="outline" className="h-9 w-9" aria-label={`Decrease quantity of ${l.product.name}`}
                              onClick={() => setQty(l.product.id, l.quantity - 1)}><Minus className="h-4 w-4" /></Button>
                            <input className="h-9 w-14 rounded border border-input bg-background text-center text-base"
                              value={l.quantity}
                              onChange={(e) => setQty(l.product.id, parseInt(e.target.value) || 0)} />
                            <Button size="icon" variant="outline" className="h-9 w-9" aria-label={`Increase quantity of ${l.product.name}`}
                              onClick={() => setQty(l.product.id, l.quantity + 1)}><Plus className="h-4 w-4" /></Button>
                          </div>
                          <span className="ml-auto text-lg font-semibold">
                            {formatMoney(Number(l.product.sellingPrice) * l.quantity)}
                          </span>
                          <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label={`Remove ${l.product.name} from cart`}
                            onClick={() => setQty(l.product.id, 0)}>
                            <X className="h-5 w-5 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Payment details — fixed section, clearly separate from items */}
            {cart.length > 0 && (
              <div className="border-t border-border px-4 py-3">
                <div className="mb-3 flex items-center gap-2">
                  <ClipboardPlus className="h-4 w-4 text-primary" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Payment details
                  </h3>
                </div>
                <div className="space-y-3">
                  {needsRx && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-sm font-medium">Prescription required</span>
                        <RxBadge className="ml-auto" />
                      </div>
                      <Field label="Prescription reference">
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
                    <Field label="Payment">
                      <Select value={payMode} onChange={(e) => setPayMode(e.target.value as typeof payMode)}>
                        <option value="full">Paid in full</option>
                        <option value="partial">Partial (rest on credit)</option>
                        <option value="credit">Full credit (on account)</option>
                      </Select>
                    </Field>
                    {payMode !== 'credit' && (
                      <Field label="Tender">
                        <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                          <option value="CASH">Cash</option>
                          <option value="CARD">Card</option>
                          <option value="MOBILE">Mobile</option>
                        </Select>
                      </Field>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
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
              </div>
            )}

            {/* Pinned totals + checkout */}
            {cart.length > 0 && (
              <div className="space-y-3 border-t border-border bg-muted/30 p-4">
                <div className="space-y-1 text-sm">
                  <Row label="Subtotal" value={formatMoney(subtotal)} />
                  {discount > 0 && <Row label="Discount" value={`- ${formatMoney(discount)}`} />}
                  <Row label="Tax" value={formatMoney(tax)} />
                  <div className="flex justify-between border-t border-border pt-2 text-lg font-semibold tracking-tight">
                    <span>Total</span><span className="text-primary">{formatMoney(total)}</span>
                  </div>
                  {due > 0 && (
                    <div className="flex justify-between font-medium text-destructive">
                      <span>Due on credit</span><span>{formatMoney(due)}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={hold}>
                    <Pause className="h-4 w-4" /> Hold
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={clear}>
                    <X className="h-4 w-4" /> Clear
                  </Button>
                </div>

                <Button className="h-12 w-full text-base" loading={checkout.isPending}
                  disabled={(due > 0 && !customerId) || (needsRx && !prescriptionRef.trim())}
                  onClick={() => checkout.mutate()}>
                  Charge {formatMoney(total)}
                </Button>
                {due > 0 && !customerId && (
                  <p className="text-center text-xs text-destructive">Select a customer to leave a balance on credit.</p>
                )}
                {needsRx && !prescriptionRef.trim() && (
                  <p className="text-center text-xs text-destructive">Enter a prescription reference to continue.</p>
                )}
              </div>
            )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn('flex justify-between text-muted-foreground')}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}