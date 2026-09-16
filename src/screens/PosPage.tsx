'use client';
import { useEffect, useMemo, useDeferredValue, useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Plus, Package, Barcode, ChevronUp, Printer, ShoppingCart, Wallet, Star, FileText } from 'lucide-react';
import { CategoriesApi, CustomersApi, InventoryApi, ProductsApi, SalesApi } from '@/api';
import type { Product, Paginated, StockItem } from '@/types';
import { useAuth } from '@/auth/AuthContext';
import { useShift } from '@/shift/ShiftContext';
import { printSale, printShiftReport } from '@/lib/print';
import { loadFavoriteIds, saveFavoriteIds } from '@/lib/favorites';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RxBadge } from '@/components/ui/RxBadge';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CartPanel, TENDERS, lineNet } from '@/components/pos/CartPanel';
import type { CartLine, DiscountType, PayMode } from '@/components/pos/CartPanel';
import { OpenShiftModal } from '@/components/pos/OpenShiftModal';
import { CloseShiftModal } from '@/components/pos/CloseShiftModal';
import { ErrorState, LoadingBlock } from '@/components/ui/misc';

/** Sentinel `categoryId` value for the pinned-favorites chip. */
const FAVORITES = '__favorites__';

export default function PosPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const { user } = useAuth();
  const { shift, isLoading: shiftLoading, isOpening, isClosing, isReporting, openShift, closeShift, loadReport } = useShift();
  const [showCloseShift, setShowCloseShift] = useState(false);
  // Master tax switch (from business settings). When off, nothing is taxed.
  const taxEnabled = user?.business?.taxEnabled ?? true;
  const [search, setSearch] = useState('');
  // Real category filter (a category id), or the FAVORITES sentinel -- both
  // pick which chip is active in the same row.
  const [categoryId, setCategoryId] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => loadFavoriteIds());
  // Persisting is a side effect of the in-memory set changing, not tangled
  // into the click handler -- keeps toggling a pure state update.
  useEffect(() => saveFavoriteIds(favorites), [favorites]);
  const toggleFavorite = (productId: string) =>
    setFavorites((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId],
    );
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  // Pay in full now, leave it all on credit, or pay part now (rest to credit).
  const [payMode, setPayMode] = useState<PayMode>('full');
  const [amountPaid, setAmountPaid] = useState(0);
  // Cash-tendered → change-due (full cash sales only). Kept separate from
  // amountPaid: tendered is never sent to the server, it's purely to compute
  // change locally -- a full sale always posts amountPaid: undefined.
  const [tendered, setTendered] = useState(0);
  // Snapshot of the last sale's tendered/change, shown in the now-empty cart
  // until the cashier starts the next sale (see `add`).
  const [lastChange, setLastChange] = useState<{ tendered: number; change: number } | null>(null);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<DiscountType>('amount');
  const [prescriptionRef, setPrescriptionRef] = useState('');
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  // Mobile cart sheet visibility. On lg+ the cart is an inline column.
  const [cartOpen, setCartOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Debounced search for the product grid: typing is instant in the input,
  // but network requests wait for a pause (useDeferredValue + keepPreviousData).
  const deferredSearch = useDeferredValue(search);

  const {
    data: products,
    isLoading: productsLoading,
    isError: productsError,
    refetch: refetchProducts,
  } = useQuery({
    queryKey:
      categoryId === FAVORITES
        ? ['pos-products', 'favorites', favorites]
        : ['pos-products', deferredSearch, categoryId],
    queryFn: () =>
      categoryId === FAVORITES
        ? favorites.length
          ? ProductsApi.list({ ids: favorites, limit: 100 })
          : Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 100, pages: 0 } } as Paginated<Product>)
        : ProductsApi.list({
            search: deferredSearch || undefined,
            categoryId: categoryId || undefined,
            limit: 50,
          }),
    placeholderData: keepPreviousData,
  });
  // Self-heal the pinned set: if a favorited id no longer resolves to a
  // product (deleted, deactivated, or a leftover from an earlier bug), drop
  // it so the count badge always matches what's actually shown. Adjusted
  // during render (React's documented pattern for this) rather than in an
  // effect, keyed on the result set so it only runs when it actually changes.
  const [prunedForKey, setPrunedForKey] = useState<string | null>(null);
  if (categoryId === FAVORITES && products) {
    const resultKey = products.data.map((p) => p.id).join(',');
    if (resultKey !== prunedForKey) {
      setPrunedForKey(resultKey);
      const found = new Set(products.data.map((p) => p.id));
      const pruned = favorites.filter((id) => found.has(id));
      if (pruned.length !== favorites.length) setFavorites(pruned);
    }
  }
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => CustomersApi.list({ limit: 100 }),
  });
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => CategoriesApi.list(),
  });
  const { data: heldSalesData } = useQuery({
    queryKey: ['held-sales'],
    queryFn: () => SalesApi.list({ status: 'held', limit: 50 }),
  });
  const heldSales = heldSalesData?.data ?? [];
  // Total on-hand quantity per product (summed across all stores), fetched in
  // pages because the API caps limit at 100.
  const { data: stock, isError: stockError, refetch: refetchStock } = useQuery({
    // Keyed under 'stock' so every invalidateQueries(['stock']) elsewhere
    // (receive, adjust, transfer, stock take, returns) refreshes POS too --
    // React Query matches by key prefix.
    queryKey: ['stock', 'pos'],
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

  const stockLoaded = stock !== undefined;

  // Total on-hand quantity per product (summed across all stores).
  const onHand = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stock?.data ?? []) {
      m.set(s.productId, (m.get(s.productId) ?? 0) + Number(s.quantity));
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

  // Category/favorites filtering now happens server-side (see the query
  // above) so this scales past whatever page of results is loaded.
  const displayProducts = products?.data ?? [];

  const needsRx = cart.some((l) => l.product.isRxRequired);

  const { subtotal, tax } = useMemo(() => {
    let sub = 0, t = 0;
    for (const l of cart) {
      const net = lineNet(l);
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
    payMode === 'full'
      ? total
      : payMode === 'credit'
        ? 0
        : Math.min(Math.max(amountPaid, 0), total);
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
    setTendered(0);
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

  const handleOpenShift = async (openingFloat: number, note?: string) => {
    try {
      await openShift(openingFloat, note);
    } catch (e) {
      show(apiError(e), 'error');
    }
  };

  const confirmCloseShift = async (countedCash: number, note?: string) => {
    try {
      const closed = await closeShift(countedCash, note);
      setShowCloseShift(false);
      if (!closed) return;
      printShiftReport(closed, {
        businessName: user?.business?.name ?? 'Shift report',
        currency: user?.business?.currency ?? 'USD',
      });
      show(
        closed.variance === 0
          ? 'Shift closed — drawer balances'
          : `Shift closed — ${closed.variance! > 0 ? 'over' : 'short'} by ${formatMoney(Math.abs(closed.variance!))}`,
      );
    } catch (e) {
      show(apiError(e), 'error');
    }
  };

  // X report: a mid-shift read of the drawer that settles nothing, so it can
  // be taken as often as the cashier likes without closing the shift.
  const printXReport = async () => {
    try {
      const fresh = await loadReport();
      if (!fresh) return;
      printShiftReport(fresh, {
        businessName: user?.business?.name ?? 'Shift report',
        currency: user?.business?.currency ?? 'USD',
      });
    } catch (e) {
      show(apiError(e), 'error');
    }
  };

  const holdMutation = useMutation({
    mutationFn: () =>
      SalesApi.hold({
        customerId: customerId || undefined,
        discount: discountAmount || undefined,
        prescriptionRef: prescriptionRef || undefined,
        // Serials aren't sent here: a held sale doesn't touch stock or the
        // Serial table (same as it doesn't consume a receipt number), so the
        // backend never persists them. Resuming always needs a fresh scan.
        items: cart.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount,
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['held-sales'] });
      setLastChange(null);
      setCart([]);
      setCartOpen(false);
      resetSaleState();
    },
    onError: (e) => show(apiError(e), 'error'),
  });
  const hold = () => {
    if (cart.length === 0) return;
    holdMutation.mutate();
  };

  useEffect(() => {
    const focusSearch = () => {
      setSearch('');
      const inp = document.querySelector('input[placeholder="Search products, SKUs, or scan a barcode…"]');
      if (inp) (inp as HTMLInputElement).focus();
    };
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement | null)?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey) {
        switch (e.key.toLowerCase()) {
          case 'h': e.preventDefault(); hold(); break;
          case 'd': e.preventDefault(); setDiscountType(discountType === 'percent' ? 'amount' : 'percent'); break;
          case 'p': e.preventDefault(); printLast(); break;
          case 'k': e.preventDefault(); focusSearch(); break;
        }
      } else {
        switch (e.key.toLowerCase()) {
          case '/': e.preventDefault(); focusSearch(); break;
          case 't': {
            // Deliberate, cashier-initiated jump to the tendered field --
            // NOT auto-focused on every item add, since that would steal
            // focus from the search box mid-barcode-scan (a scanner just
            // types into whatever has focus and sends Enter).
            const input = document.querySelector('input[aria-label="Amount tendered"]');
            if (input) { e.preventDefault(); (input as HTMLInputElement).focus(); }
            break;
          }
          case 'enter': if (cart.length > 0) { const last = cart[cart.length - 1]; setQty(last.product.id, last.quantity + 1); } break;
          case 'escape': setSearch(''); break;
          case 'tab':
            // Credit sales have no tender to cycle.
            if (payMode === 'credit') break;
            e.preventDefault();
            setPaymentMethod((m) => {
              const i = TENDERS.findIndex((t) => t.value === m);
              return TENDERS[(i + 1) % TENDERS.length].value;
            });
            break;
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [cart, discountType, hold, payMode, printLast, setSearch]);

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
        items: cart.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount,
          serials: l.serials,
        })),
      }),
    onSuccess: (sale) => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['credit'] });
      // The shift's running totals are computed server-side from its sales,
      // so refetching (rather than tallying client-side) is the source of truth.
      qc.invalidateQueries({ queryKey: ['shift-current'] });
      show(`Sale ${sale.receiptNo} completed`);
      setLastSaleId(sale.id);
      // Cash tendered → change due stays visible in the now-empty cart until
      // the next item is added, so the cashier can hand back change without
      // it disappearing the instant the sale completes.
      setLastChange(
        payMode === 'full' && paymentMethod === 'CASH' && tendered > 0
          ? { tendered, change: Math.max(0, Math.round((tendered - total) * 100) / 100) }
          : null,
      );
      setCart([]);
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
    // The next item scanned dismisses the previous sale's change-due display.
    setLastChange(null);
    setCart((c) =>
      existing
        ? c.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l))
        : [...c, { product, quantity: 1 }],
    );
  };
  const setQty = (id: string, qty: number) => {
    const line = cart.find((l) => l.product.id === id);
    if (!line) return;
    // Serialised goods are whole units -- one scanned serial each -- but the
    // quantity box accepts decimals for weighed items, and a fractional qty
    // would block checkout with an unsatisfiable "N of 1.5 serials" warning.
    let next = line.product.trackSerials ? Math.round(qty) : qty;
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

  const updateLine = (id: string, updates: { unitPrice?: number; discount?: number; serials?: string[] }) =>
    setCart((c) => c.map((l) => (l.product.id === id ? { ...l, ...updates } : l)));

  const resumeMutation = useMutation({
    mutationFn: (id: string) => SalesApi.resume(id),
    onSuccess: (held) => {
      qc.invalidateQueries({ queryKey: ['held-sales'] });
      setLastChange(null);
      setCart(
        held.items.map((i) => ({
          product: i.product,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount,
        })),
      );
      setCustomerId(held.customerId ?? '');
      setDiscount(held.discount);
      setDiscountType('amount');
      setPrescriptionRef(held.prescriptionRef ?? '');
      setCartOpen(true);
    },
    onError: (e) => show(apiError(e), 'error'),
  });
  // Bring a parked sale back into the cart. Refuses to clobber a cart the
  // cashier is already mid-way through -- they must finish, hold, or clear
  // it first.
  const resume = (id: string) => {
    if (cart.length > 0) {
      show('Finish or hold the current sale before resuming another.', 'error');
      return;
    }
    resumeMutation.mutate(id);
  };

  const discardMutation = useMutation({
    mutationFn: (id: string) => SalesApi.discardHeld(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['held-sales'] }),
    onError: (e) => show(apiError(e), 'error'),
  });

  const clear = () => {
    setLastChange(null);
    setCart([]);
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

  return (
    <div className="flex h-[calc(100dvh-6rem)] flex-col lg:h-[calc(100dvh-7rem)]">
      {/* Header — register + last-receipt print */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Point of Sale</h1>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {shift && (
            <>
              <Button
                variant="outline"
                size="sm"
                loading={isReporting}
                onClick={printXReport}
                title="Print an X report — mid-shift drawer reading, shift stays open"
              >
                <FileText className="h-4 w-4" /> X report
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCloseShift(true)}
                title="Close shift and print a Z report"
              >
                <Wallet className="h-4 w-4" /> {formatMoney(shift.gross)} · Close shift
              </Button>
            </>
          )}
          {lastSaleId && (
            <Button variant="outline" size="sm" onClick={printLast} title="Print the last sale's receipt">
              <Printer className="h-4 w-4" /> Last receipt
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowHelp(true)} title="Show keyboard hints">
            ?
          </Button>
        </div>
      </div>

      {/* Blocks the till until the cashier counts a starting float. Held off
          while the current shift is still loading, so an already-open shift
          doesn't flash this modal before the fetch resolves. */}
      {!shiftLoading && !shift && <OpenShiftModal onOpen={handleOpenShift} isPending={isOpening} />}

      {showCloseShift && shift && (
        <CloseShiftModal
          shift={shift}
          onClose={() => setShowCloseShift(false)}
          onConfirm={confirmCloseShift}
          isPending={isClosing}
        />
      )}

      {/* Help overlay */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground border border-border rounded-lg p-6 max-w-sm w-full text-center">
            <h2 className="text-lg font-semibold mb-4">Keyboard Shortcuts</h2>
            <ul className="space-y-2 text-left mx-auto max-h-80 overflow-y-auto">
              <li>/ or Cmd+K — Focus search</li>
              <li>T — Focus amount tendered</li>
              <li>Enter — Add quantity to last cart line</li>
              <li>Tab — Cycle payment methods</li>
              <li>H — Hold sale</li>
              <li>D — Toggle discount (amount/percent)</li>
              <li>P — Print last receipt</li>
              <li>Esc — Clear search</li>
            </ul>
            <button
              onClick={() => setShowHelp(false)}
              className="mt-4 inline-block px-4 py-2 bg-primary text-primary-foreground rounded"
            >
              Close
            </button>
          </div>
        </div>
      )}

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

          {stockError && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <span>
                Stock levels failed to load — items below may show as out of stock even
                if they aren&apos;t. Don&apos;t trust the stock badges until this is fixed.
              </span>
              <button
                type="button"
                onClick={() => refetchStock()}
                className="shrink-0 font-medium underline underline-offset-2"
              >
                Retry
              </button>
            </div>
          )}

          {/* Category filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Chip active={categoryId === ''} onClick={() => setCategoryId('')}>
              All
            </Chip>
            <Chip active={categoryId === FAVORITES} onClick={() => setCategoryId(FAVORITES)}>
              <Star className={cn('h-3.5 w-3.5', categoryId === FAVORITES && 'fill-current')} />
              Favorites ({favorites.length})
            </Chip>
            {categories?.map((c) => (
              <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {productsError ? (
              <ErrorState
                title="Couldn't load products"
                description="The product catalog failed to load -- this is not the same as being out of stock. Try again."
                onRetry={() => refetchProducts()}
              />
            ) : productsLoading ? (
              <LoadingBlock label="Loading products…" />
            ) : (
              <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
              {displayProducts.map((p) => {
                const available = onHand.get(p.id) ?? 0;
                // Until the stock feed lands, "not loaded" is indistinguishable
                // from "zero" -- don't claim out of stock on a guess. Matches
                // maxOf, which treats an unknown product as unrestricted.
                const out = stockLoaded && available <= 0;
                const isFavorite = favorites.includes(p.id);
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
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }}
                        aria-label={isFavorite ? `Remove ${p.name} from favorites` : `Add ${p.name} to favorites`}
                        className={cn(
                          'absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-background/80 shadow-sm backdrop-blur-sm transition-colors',
                          isFavorite ? 'text-warning' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
                      </button>
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
                        {stockLoaded && (
                          <StockBadge count={available} reorder={reorderLevels.get(p.id) ?? 0} />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {displayProducts.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {categoryId === FAVORITES
                  ? 'No favorites yet — tap the star on a product to pin it here.'
                  : 'No products found.'}
              </p>
            )}
              </>
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
              shiftOpen={!!shift}
              heldSales={heldSales}
              resumingId={resumeMutation.isPending ? (resumeMutation.variables ?? null) : null}
              discardingId={discardMutation.isPending ? (discardMutation.variables ?? null) : null}
              customers={customers?.data ?? []}
              customerId={customerId}
              onCustomerChange={setCustomerId}
              onSetQty={setQty}
              onUpdateLine={updateLine}
              atMax={atMax}
              onHold={hold}
              holding={holdMutation.isPending}
              onResumeHeld={resume}
              onDiscardHeld={(id) => discardMutation.mutate(id)}
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
              tendered={tendered}
              onTenderedChange={setTendered}
              lastChange={lastChange}
              needsRx={needsRx}
              prescriptionRef={prescriptionRef}
              onPrescriptionRefChange={setPrescriptionRef}
              onClose={() => setCartOpen(false)}
            />
          </div>
        </div>
      </div>

      {/* Floating cart bar (mobile only) -- also the only way to reach the
          held-sales tray on small screens, so it must stay visible even
          when the active cart is empty but sales are parked. */}
      {(cartCount > 0 || heldSales.length > 0) && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className={cn(
            'fixed inset-x-4 bottom-4 z-40 flex h-14 items-center gap-3 rounded-full border px-4 shadow-lg lg:hidden',
            cartCount > 0 ? 'border-border bg-card' : 'border-warning/40 bg-warning/10',
          )}
        >
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full',
              cartCount > 0 ? 'bg-primary text-primary-foreground' : 'bg-warning/20 text-warning',
            )}
          >
            <ShoppingCart className="h-4 w-4" />
          </span>
          {cartCount > 0 ? (
            <>
              <span className="text-sm font-semibold text-foreground">
                {cartCount} item{cartCount !== 1 ? 's' : ''}
              </span>
              <span className="ml-auto text-base font-bold text-primary">{formatMoney(total)}</span>
            </>
          ) : (
            <span className="text-sm font-semibold text-foreground">
              {heldSales.length} sale{heldSales.length !== 1 ? 's' : ''} on hold
            </span>
          )}
          <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" />
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
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
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
