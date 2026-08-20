'use client';
import { useMemo, useDeferredValue, useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Plus, Package, Barcode, ChevronUp, Printer, ShoppingCart } from 'lucide-react';
import { CategoriesApi, CustomersApi, InventoryApi, ProductsApi, SalesApi } from '@/api';
import type { Product, Paginated, StockItem } from '@/types';
import { useAuth } from '@/auth/AuthContext';
import { printSale } from '@/lib/print';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RxBadge } from '@/components/ui/RxBadge';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CartPanel } from '@/components/pos/CartPanel';
import type { CartLine, DiscountType, PayMode } from '@/components/pos/CartPanel';

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
  const [payMode, setPayMode] = useState<PayMode>('full');
  const [amountPaid, setAmountPaid] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<DiscountType>('amount');
  const [prescriptionRef, setPrescriptionRef] = useState('');
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  // Mobile cart sheet visibility. On lg+ the cart is an inline column.
  const [cartOpen, setCartOpen] = useState(false);

  // Debounced search for the product grid: typing is instant in the input,
  // but network requests wait for a pause (useDeferredValue + keepPreviousData).
  const deferredSearch = useDeferredValue(search);

  const { data: products } = useQuery({
    queryKey: ['pos-products', deferredSearch],
    queryFn: () => ProductsApi.list({ search: deferredSearch || undefined, limit: 50 }),
    placeholderData: keepPreviousData,
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

  const reorderLevels = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stock?.data ?? []) {
      const lvl = s.effectiveReorderLevel ?? s.reorderLevel ?? s.product?.reorderLevel ?? 0;
      m.set(s.productId, (m.get(s.productId) ?? 0) + lvl);
    }
    return m;
  }, [stock]);

  const filteredProducts = useMemo(() => {
    const list = products?.data ?? [];
    if (!categoryId) return list;
    return list.filter((p) => p.categories?.some((c) => c.id === categoryId));
  }, [products, categoryId]);

  const needsRx = cart.some((l) => l.product.isRxRequired);

  const { subtotal, tax } = useMemo(() => {
    let sub = 0, t = 0;
    for (const l of cart) {
      const net = Number(l.product.sellingPrice) * l.quantity;
      sub += net;
      // Tax applies only when the master switch is on AND the product is taxable.
      if (taxEnabled && l.product.isTaxable) t += (net * Number(l.product.taxRate)) / 100;
    }
    return { subtotal: Math.round(sub * 100) / 100, tax: Math.round(t * 100) / 100 };
  }, [cart, taxEnabled]);

  const discountAmount = useMemo(() => {
    if (!discount || discount <= 0) return 0;
    const amt = discountType === 'percent' ? (subtotal * discount) / 100 : discount;
    return Math.round(amt * 100) / 100;
  }, [discount, discountType, subtotal]);

  const total = useMemo(
    () => Math.max(0, Math.round((subtotal + tax - discountAmount) * 100) / 100),
    [subtotal, tax, discountAmount],
  );

  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);

  // How much is collected now vs. left on the customer's account.
  const paidNow =
    payMode === 'full' ? total : payMode === 'credit' ? 0 : Math.min(amountPaid, total);
  const due = Math.max(0, Math.round((total - paidNow) * 100) / 100);

  // Ceiling on how many units of a product can be sold. Falls back to
  // unlimited while the stock feed is still loading.
  const maxOf = (id: string) => onHand.get(id) ?? Infinity;

  const resetSaleState = () => {
    setDiscount(0);
    setDiscountType('amount');
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
        discount: discountAmount || undefined,
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
      setCartOpen(false);
    },
    onError: (e) => show(apiError(e), 'error'),
  });

  const add = (product: Product) => {
    const existing = cart.find((l) => l.product.id === product.id);
    const next = (existing?.quantity ?? 0) + 1;
    const max = maxOf(product.id);
    if (next > max) {
      if (Number.isFinite(max)) {
        show(`Only ${max} ${product.unit} of ${product.name} in stock`, 'error');
      }
      return;
    }
    setCart((c) =>
      existing
        ? c.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l))
        : [...c, { product, quantity: 1 }],
    );
  };
  const setQty = (id: string, qty: number) => {
    const line = cart.find((l) => l.product.id === id);
    if (!line) return;
    let next = qty;
    const max = maxOf(id);
    if (next > max) {
      if (Number.isFinite(max)) show(`Only ${max} ${line.product.unit} in stock`, 'error');
      next = max;
    }
    setCart((c) =>
      next <= 0 ? c.filter((l) => l.product.id !== id) : c.map((l) => (l.product.id === id ? { ...l, quantity: next } : l)),
    );
  };
  const atMax = (line: CartLine) => maxOf(line.product.id) <= line.quantity;

  // Hold the current sale aside and start a fresh cart; Resume brings it back.
  const hold = () => {
    if (cart.length === 0) return;
    setHeldCart(cart);
    setCart([]);
    setCartOpen(false);
    resetSaleState();
  };
  const resume = () => {
    if (heldCart) setCart(heldCart);
    setHeldCart(null);
  };
  const clear = () => {
    setCart([]);
    setHeldCart(null);
    setCartOpen(false);
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
        {/* Product picker */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:w-[60%]">
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
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
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
                          <Package className="h-5 w-5" />
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
                    <div className="flex flex-1 flex-col gap-1 p-2.5">
                      <div className="flex items-start gap-1">
                        <span className="line-clamp-2 flex-1 text-sm font-medium">{p.name}</span>
                        {p.isRxRequired && <RxBadge />}
                      </div>
                      <div className="mt-auto flex items-center justify-between pt-1">
                        <span className="text-sm font-bold text-primary">{formatMoney(p.sellingPrice)}</span>
                        <button
                          disabled={out}
                          onClick={(e) => { e.stopPropagation(); add(p); }}
                          aria-label={`Add ${p.name}`}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-xs text-muted-foreground">{p.sku || p.unit}</span>
                        <StockBadge count={available} reorder={reorderLevels.get(p.id) ?? 0} />
                      </div>
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

        {/* Cart — inline right column on lg+, slide-up sheet on smaller screens */}
        <div
          className={cn(
            'fixed inset-x-0 bottom-0 top-16 z-50 lg:static lg:inset-auto lg:z-auto lg:flex lg:min-h-0 lg:w-[40%] lg:flex-col',
            cartOpen ? 'pointer-events-auto' : 'pointer-events-none',
            'lg:pointer-events-auto',
          )}
          aria-hidden={!cartOpen}
        >
          {/* Backdrop (mobile only) */}
          <div
            onClick={() => setCartOpen(false)}
            className={cn(
              'fixed inset-0 bg-black/40 transition-opacity lg:hidden',
              cartOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          />
          {/* Sheet */}
          <div
            className={cn(
              'fixed inset-x-0 bottom-0 top-16 z-10 flex min-h-0 flex-1 flex-col transition-transform duration-300 ease-out lg:static lg:inset-auto lg:z-auto lg:translate-y-0',
              cartOpen ? 'translate-y-0' : 'translate-y-full',
            )}
          >
            <CartPanel
              cart={cart}
              cartCount={cartCount}
              heldCart={heldCart}
              customers={customers?.data ?? []}
              customerId={customerId}
              onCustomerChange={setCustomerId}
              onSetQty={setQty}
              atMax={atMax}
              onHold={hold}
              onResume={resume}
              onClear={clear}
              onCheckout={() => checkout.mutate()}
              checkingOut={checkout.isPending}
              subtotal={subtotal}
              tax={tax}
              total={total}
              paidNow={paidNow}
              due={due}
              discount={discount}
              discountAmount={discountAmount}
              onDiscountChange={setDiscount}
              discountType={discountType}
              onDiscountTypeChange={setDiscountType}
              payMode={payMode}
              onPayModeChange={setPayMode}
              paymentMethod={paymentMethod}
              onPaymentMethodChange={setPaymentMethod}
              amountPaid={amountPaid}
              onAmountPaidChange={setAmountPaid}
              needsRx={needsRx}
              prescriptionRef={prescriptionRef}
              onPrescriptionRefChange={setPrescriptionRef}
              onClose={() => setCartOpen(false)}
            />
          </div>
        </div>
      </div>

      {/* Floating cart bar (mobile only) */}
      {cartCount > 0 && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-4 bottom-4 z-40 flex h-14 items-center gap-3 rounded-full border border-border bg-card px-4 shadow-lg lg:hidden"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ShoppingCart className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold text-foreground">
            {cartCount} item{cartCount !== 1 ? 's' : ''}
          </span>
          <span className="ml-auto text-base font-bold text-primary">{formatMoney(total)}</span>
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
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

/** Availability hint for product cards. */
function StockBadge({ count, reorder }: { count: number; reorder: number }) {
  if (count <= 0) {
    return (
      <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
        Out of stock
      </span>
    );
  }
  if (count <= reorder) {
    return (
      <span className="shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
        Low: {count}
      </span>
    );
  }
  return <span className="shrink-0 text-xs text-muted-foreground">{count} in stock</span>;
}
