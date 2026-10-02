'use client';
import { useEffect, useEffectEvent, useMemo, useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Barcode, Clock } from 'lucide-react';
import { CategoriesApi, CustomersApi, InventoryApi, ProductsApi, SalesApi, ShiftsApi, type CloseShiftBody } from '@/api';
import type { Product, Paginated } from '@/types';
import { useAuth } from '@/auth/AuthContext';
import { useShift } from '@/shift/ShiftContext';
import { printSale, printShiftReport } from '@/lib/print';
import { loadFavoriteIds, saveFavoriteIds } from '@/lib/favorites';
import { useDebounced } from '@/hooks/useDebounced';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CartPanel, lineNet } from '@/components/pos/CartPanel';
import { useAcceptedTenders } from '@/hooks/useAcceptedTenders';
import { cartTotals } from '@/lib/cart-totals';
import { liveRefetchInterval } from '@/lib/live';
import type { CartLine, DiscountType, PayMode } from '@/components/pos/CartPanel';
import { OpenShiftModal } from '@/components/pos/OpenShiftModal';
import { ChooseStoreModal } from '@/components/pos/ChooseStoreModal';
import { CloseShiftModal } from '@/components/pos/CloseShiftModal';
import { FAVORITES, ProductGrid } from '@/components/pos/ProductGrid';
import { PosHeader } from '@/components/pos/PosHeader';
import { ShortcutsHelp } from '@/components/pos/ShortcutsHelp';
import { MobileCartBar } from '@/components/pos/MobileCartBar';
import { CashMovementModal } from '@/components/pos/CashMovementModal';
import { isStaleShift } from '@/lib/cash';
import { customerKey } from '@/components/pos/CustomerPicker';
import { ErrorState } from '@/components/ui/misc';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { productExpiry } from '@/lib/expiry';
import { useActiveStores, useStores } from '@/hooks/useStores';
import { resolvePosStore } from '@/lib/posStore';
import { useStoreScope } from '@/store/StoreContext';

export default function PosPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const { user } = useAuth();
  const {
    shift,
    isLoading: shiftLoading,
    isError: shiftError,
    retry: retryShift,
    isOpening,
    isClosing,
    isReporting,
    isMovingCash,
    openShift,
    closeShift,
    moveCash,
    loadReport,
    joinable,
    joinShift,
    tills,
    switchTill,
    setTillStore,
  } = useShift();
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [showCashMove, setShowCashMove] = useState(false);
  // Which store this till sells from. Explicit on every request: the grid must
  // show the stock the cashier can actually hand over, and the sale must deduct
  // from that same store rather than whatever the server falls back to.
  const [chosenStoreId, setChosenStoreId] = useState<string | null>(null);
  const { storeId: scopeStoreId } = useStoreScope();
  // A store picked inside the POS wins over the header -- but only until the
  // header moves again. Without this reset the first in-POS pick pinned the
  // till for good and every later branch switch was silently ignored, which is
  // the very thing the header switch is for. Adjusted during render (React's
  // documented pattern) rather than in an effect.
  const [prevScope, setPrevScope] = useState(scopeStoreId);
  if (prevScope !== scopeStoreId) {
    setPrevScope(scopeStoreId);
    setChosenStoreId(null);
  }
  const { data: allStores } = useStores();
  const { data: activeStores } = useActiveStores();
  const posStore = resolvePosStore({
    role: user?.role ?? 'CASHIER',
    assignedStoreId: user?.storeId,
    openShiftStoreId: shift?.storeId,
    // The header switch doubles as the till's choice, so an owner moving
    // branches there arrives at the POS already on it. A pick made inside the
    // POS wins, and an open shift still overrides both.
    chosenStoreId: chosenStoreId ?? (scopeStoreId || null),
    activeStoreIds: (activeStores ?? []).map((st) => st.id),
  });
  const storeId = posStore.storeId;
  // The shift is looked up at the till's store, not the header's "all
  // stores": an owner with no till of their own is put on the one already
  // open here only once the server knows where "here" is.
  useEffect(() => {
    setTillStore(storeId);
  }, [storeId, setTillStore]);
  const storesLoaded = activeStores !== undefined;
  // A shift can pin a store that has since been deactivated, so name it from
  // the full list rather than the sellable one.
  const storeName = allStores?.find((st) => st.id === storeId)?.name ?? null;
  const multiStore = (allStores?.length ?? 0) > 1;
  // Master tax switch (from business settings). When off, nothing is taxed.
  const taxEnabled = user?.business?.taxEnabled ?? true;
  // A pharmacy can't sell expired stock (the API refuses it too); other shops
  // are warned and may go ahead.
  const isPharmacy = user?.business?.type === 'PHARMACY';
  const [expiredPrompt, setExpiredPrompt] = useState<{ product: Product; serial?: string } | null>(null);
  // Expired products the cashier already said yes to in this sale, so the
  // next + on the same line doesn't ask again.
  const [okExpired, setOkExpired] = useState<Set<string>>(() => new Set());
  // Whether shelf prices already contain their tax.
  const taxInclusive = user?.business?.taxInclusive ?? false;
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
  const [picked, setPaymentMethod] = useState('CASH');
  // Only the tenders the shop takes. One the owner has just turned off falls
  // back to cash rather than going out on the sale.
  const tenders = useAcceptedTenders();
  const paymentMethod = tenders.some((t) => t.value === picked) ? picked : 'CASH';
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
  // Below lg a closed cart sheet is off screen: hidden from screen readers and
  // out of the tab order. On lg+ it's always on screen, whatever `cartOpen` says.
  const cartInline = useMediaQuery('(min-width: 1024px)');
  const cartHidden = !cartInline && !cartOpen;
  const [showHelp, setShowHelp] = useState(false);

  // Debounced search for the product grid: typing stays instant in the input,
  // and the request waits for the cashier to stop typing.
  //
  // This was `useDeferredValue`, described in the comment as making "network
  // requests wait for a pause". It does not: it de-prioritises the render, but
  // every settled keystroke still reaches the query key, so a seven-letter
  // product name was seven requests. `useDebounced` actually skips the
  // intermediate values; `keepPreviousData` keeps the old grid on screen while
  // the one request that survives is in flight.
  const deferredSearch = useDebounced(search);

  const {
    data: products,
    isLoading: productsLoading,
    isError: productsError,
    refetch: refetchProducts,
  } = useQuery({
    // Prefixed with 'stock' because the rows now carry this store's on-hand
    // quantity and reorder level (see the `onHand` map below). Every
    // invalidateQueries(['stock']) elsewhere -- receive, adjust, transfer,
    // stock take, returns, checkout -- has to refresh the grid, and React
    // Query matches by key prefix. This is the same trick the separate stock
    // query used before it was folded into this one.
    queryKey:
      categoryId === FAVORITES
        ? ['stock', 'pos-products', 'favorites', favorites, storeId]
        : ['stock', 'pos-products', deferredSearch, categoryId, storeId],
    queryFn: () =>
      categoryId === FAVORITES
        ? favorites.length
          ? ProductsApi.list({ ids: favorites, limit: 100, storeId: storeId ?? undefined })
          : Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 100, pages: 0 } } as Paginated<Product>)
        : ProductsApi.list({
            search: deferredSearch || undefined,
            categoryId: categoryId || undefined,
            limit: 50,
            // The till only sells what this store carries.
            storeId: storeId ?? undefined,
          }),
    placeholderData: keepPreviousData,
    // Another till selling the same stock moves these numbers.
    refetchInterval: liveRefetchInterval,
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
  // Just the chosen customer. The picker searches on the server as the
  // cashier types and seeds this entry when they pick someone; a resumed held
  // sale, which carries only the id, fetches it here.
  const { data: selectedCustomer } = useQuery({
    queryKey: customerKey(customerId),
    queryFn: () => CustomersApi.get(customerId),
    enabled: !!customerId,
  });
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => CategoriesApi.list(),
  });
  const { data: heldSalesData } = useQuery({
    // Scoped to the till's store: a cart parked at another branch isn't this
    // cashier's to resume, and resuming it here would price it against this
    // store's stock.
    queryKey: ['held-sales', storeId],
    enabled: !!storeId,
    queryFn: () => SalesApi.list({ status: 'held', limit: 50, storeId: storeId! }),
    refetchInterval: liveRefetchInterval,
  });
  const heldSales = heldSalesData?.data ?? [];
  // On-hand quantity and reorder level per product at the till's store.
  //
  // These come along with the product rows now (`GET /products?storeId=`
  // returns `onHandQty` and `effectiveReorderLevel` when scoped to a store).
  // The till used to mirror the store's whole stock table into the browser to
  // build these two maps -- one request per 100 SKUs, in parallel, re-fired
  // after every sale -- which at 5,000 SKUs spent the per-IP rate limit in
  // about two sales.
  const stockLoaded = products !== undefined;

  const onHand = useMemo(() => {
    const m = new Map<string, number>();
    // Cart lines first. The grid holds one page of results, so a product added
    // before the cashier typed a search -- or resumed from a held sale -- is no
    // longer in `products.data`, and without this its ceiling would silently
    // become unlimited mid-sale. Each line carries the row it was added from,
    // which is the same figure the grid showed at the time.
    for (const l of cart) {
      if (l.product.onHandQty != null) m.set(l.product.id, Number(l.product.onHandQty));
    }
    // Live rows win: they are the fresher read of the same number.
    for (const p of products?.data ?? []) m.set(p.id, Number(p.onHandQty ?? 0));
    return m;
  }, [products, cart]);

  // Units in expired batches, by product -- same sources as `onHand`.
  const expiredQty = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cart) if (l.product.expiry) m.set(l.product.id, l.product.expiry.expiredQty);
    for (const p of products?.data ?? []) m.set(p.id, p.expiry?.expiredQty ?? 0);
    return m;
  }, [products, cart]);

  const reorderLevels = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products?.data ?? []) {
      m.set(p.id, p.effectiveReorderLevel ?? p.reorderLevel ?? 0);
    }
    return m;
  }, [products]);

  // Category/favorites filtering now happens server-side (see the query
  // above) so this scales past whatever page of results is loaded.
  const displayProducts = products?.data ?? [];

  const needsRx = cart.some((l) => l.product.isRxRequired);

  // Tax applies only when the master switch is on AND the product is taxable.
  const { subtotal, tax, discountAmount, total, paidNow, due } = cartTotals({
    lines: cart.map((l) => ({
      net: lineNet(l),
      taxRate: taxEnabled && l.product.isTaxable ? Number(l.product.taxRate) : 0,
    })),
    taxInclusive,
    discount,
    discountType,
    payMode,
    amountPaid,
  });

  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);

  // Ceiling on how many units of a product can be sold. Falls back to
  // unlimited for a product whose stock we have never seen -- while the first
  // page is still loading, or for a held sale resumed with items that never
  // appeared in this till's grid. The server's guarded SQL is what actually
  // prevents an oversell; this is the courtesy warning in front of it.
  // A pharmacy sells only what's in date: the shelf minus expired batches.
  const maxOf = (id: string) => {
    const stock = onHand.get(id) ?? Infinity;
    const expired = isPharmacy ? (expiredQty.get(id) ?? 0) : 0;
    return expired > 0 ? Math.max(stock - expired, 0) : stock;
  };

  const resetSaleState = () => {
    setDiscount(0);
    setDiscountType('amount');
    setCustomerId('');
    setPrescriptionRef('');
    setPaymentMethod('CASH');
    setPayMode('full');
    setAmountPaid(0);
    setTendered(0);
    setOkExpired(new Set());
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

  const handleOpenShift = async (openingFloat: number, note?: string, separateDrawer?: boolean) => {
    if (!storeId) {
      show('Pick a store before opening a shift', 'error');
      return;
    }
    try {
      // The shift opens against the same store the till sells from, so its
      // Z report reconciles the drawer that actually took the money.
      await openShift(openingFloat, note, storeId, separateDrawer);
    } catch (e) {
      show(apiError(e), 'error');
    }
  };

  const confirmCloseShift = async (body: CloseShiftBody) => {
    try {
      const closed = await closeShift(body);
      setShowCloseShift(false);
      if (!closed) return;
      printShiftReport(closed, {
        businessName: user?.business?.name ?? 'Shift report',
        currency: user?.business?.currency ?? 'USD',
      });
      // A blind close comes back without the variance: the cashier is not
      // told whether they balanced.
      show(
        closed.variance === null
          ? 'Shift closed'
          : closed.variance === 0
            ? 'Shift closed — drawer balances'
            : `Shift closed — ${closed.variance > 0 ? 'over' : 'short'} by ${formatMoney(Math.abs(closed.variance))}`,
      );
    } catch (e) {
      show(apiError(e), 'error');
    }
  };

  const recordCashMove = async (body: Parameters<typeof moveCash>[0]) => {
    try {
      await moveCash(body);
      show(
        `${body.type === 'PAY_IN' ? 'Paid in' : 'Paid out'} ${formatMoney(body.amount)}`,
      );
    } catch (e) {
      show(apiError(e), 'error');
      throw e; // keep the dialog's fields so the cashier can fix and retry
    }
  };

  // What the last shift at this store left in the drawer, offered as the
  // opening float. Only asked while there is a shift to open.
  const { data: suggestedFloat } = useQuery({
    queryKey: ['shift-float', storeId],
    queryFn: () => ShiftsApi.suggestedFloat(storeId!),
    enabled: !!storeId && !shiftLoading && !shift && !shiftError,
    staleTime: 15_000,
  });
  const staleShift = !!shift && isStaleShift(shift.openedAt);

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
      // The shift can have been closed from another till since this page
      // loaded, in which case the figures are final and print as a Z report.
      // Say so, because the button said X.
      if (!fresh.isOpen) {
        show('That shift was already closed elsewhere — printed as a Z report.', 'info');
      }
    } catch (e) {
      show(apiError(e), 'error');
    }
  };

  const holdMutation = useMutation({
    mutationFn: () =>
      SalesApi.hold({
        storeId: storeId ?? undefined,
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
    if (cart.length === 0 || holdMutation.isPending) return;
    holdMutation.mutate();
  };

  // One checkout at a time. `checkout.isPending` alone can't be trusted for
  // this: two Enter presses in the tendered field -- or a scanner's trailing
  // Enter landing there -- arrive before React re-renders, both read the old
  // `false`, and the same cart was rung up twice: charged twice, stock taken
  // twice. A ref flips synchronously, so the second press sees it.
  const checkingOutRef = useRef(false);
  const completeSale = () => {
    if (checkingOutRef.current) return;
    checkingOutRef.current = true;
    checkout.mutate(undefined, {
      onSettled: () => {
        checkingOutRef.current = false;
      },
    });
  };

  const checkout = useMutation({
    mutationFn: () =>
      SalesApi.create({
        storeId: storeId ?? undefined,
        customerId: customerId || undefined,
        // The drawer this till is showing. The server would resolve the same
        // one on its own, but naming it closes the gap where an owner is
        // looking at Ramesh's till while the server picks a shift that opened
        // since the page loaded.
        shiftId: shift?.id,
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

  /**
   * Put one unit in the cart. With `serial` (a scanned IMEI), that unit: it
   * fills a line still short of serials, or adds a unit carrying it.
   */
  const add = (product: Product, confirmedExpired = false, serial?: string) => {
    const existing = cart.find((l) => l.product.id === product.id);
    if (serial && existing?.serials?.includes(serial)) {
      show(`${serial} is already in the cart`, 'error');
      return;
    }
    const fillsSlot = !!serial && !!existing && (existing.serials?.length ?? 0) < existing.quantity;
    const next = (existing?.quantity ?? 0) + (fillsSlot ? 0 : 1);
    const expiry = productExpiry(product, onHand.get(product.id));
    if (expiry?.kind === 'expired') {
      if (isPharmacy) {
        show(`${product.name} has expired and can't be sold. Write it off in Stock → Expiring.`, 'error');
        return;
      }
      if (!confirmedExpired && !okExpired.has(product.id)) {
        setExpiredPrompt({ product, serial });
        return;
      }
    }
    const max = maxOf(product.id);
    if (next > max) {
      if (Number.isFinite(max)) {
        show(
          isPharmacy && (expiredQty.get(product.id) ?? 0) > 0
            ? `Only ${max} ${product.unit} of ${product.name} in date; the rest has expired`
            : `Only ${max} ${product.unit} of ${product.name} in stock`,
          'error',
        );
      }
      return;
    }
    // The next item scanned dismisses the previous sale's change-due display.
    setLastChange(null);
    setCart((c) =>
      existing
        ? c.map((l) =>
            l.product.id === product.id
              ? { ...l, quantity: next, ...(serial ? { serials: [...(l.serials ?? []), serial] } : {}) }
              : l,
          )
        : [...c, { product, quantity: 1, ...(serial ? { serials: [serial] } : {}) }],
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

  // The till's keyboard shortcuts (listed in ShortcutsHelp). An effect event:
  // it always sees this render's cart and tenders, while the listener below
  // is added once rather than on every keystroke's re-render.
  const onShortcut = useEffectEvent((e: KeyboardEvent) => {
    const focusSearch = () => {
      setSearch('');
      const inp = document.querySelector('input[placeholder="Search products, SKUs, or scan a barcode…"]');
      if (inp) (inp as HTMLInputElement).focus();
    };
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
          setPaymentMethod(() => {
            const i = tenders.findIndex((t) => t.value === paymentMethod);
            return tenders[(i + 1) % tenders.length].value;
          });
          break;
      }
    }
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onShortcut(e);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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
      return;
    } catch {
      // Not a product barcode -- maybe a unit's serial / IMEI.
    }
    try {
      const unit = await InventoryApi.lookupSerial(code);
      if (unit.status !== 'IN_STOCK' || unit.storeId !== storeId) {
        show(`${code}: ${unit.product.name}, ${unit.where}`, 'error');
        setSearch('');
        return;
      }
      // The grid row carries this store's on-hand figure, which the till's
      // stock ceiling reads -- fetch it rather than add a bare product.
      const rows = await ProductsApi.list({ ids: [unit.productId], limit: 1, storeId: storeId ?? undefined });
      const product = rows.data[0];
      if (product) {
        add(product, false, unit.serialNumber);
        setSearch('');
      }
    } catch {
      // Neither -- leave the text as a normal search filter.
    }
  };

  return (
    <div className="flex h-[calc(100dvh-6rem)] flex-col lg:h-[calc(100dvh-7rem)]">
      <PosHeader
        multiStore={multiStore}
        storesLoaded={storesLoaded}
        storeName={storeName}
        lockedBy={posStore.lockedBy}
        shift={shift}
        tills={tills}
        onSwitchTill={(id) => {
          switchTill(id);
          const t = tills.find((x) => x.id === id);
          if (t) show(t.isOwnShift ? 'Back on your till' : `Now selling into ${t.openedBy.name}’s till`);
        }}
        isReporting={isReporting}
        onCashMove={() => setShowCashMove(true)}
        onXReport={printXReport}
        onCloseShift={() => setShowCloseShift(true)}
        canPrintLast={!!lastSaleId}
        onPrintLast={printLast}
        onHelp={() => setShowHelp(true)}
      />

      {/* Couldn't load the shift: not the same as having none. Offering "open
          shift" here is how a till with a shift already running got refused
          with "close it first" -- so block the till and offer a retry. */}
      {shiftError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-border bg-card p-2 shadow-lg">
            <ErrorState
              title="Couldn’t load your shift"
              description="The till can’t tell whether a shift is already open, so it won’t open a new one. Check your connection and try again."
              onRetry={retryShift}
            />
          </div>
        </div>
      )}

      {/* The store comes first: opening a shift needs one, and so does every
          sale. Held off until the stores and the shift have loaded so this
          doesn't flash when an open shift is about to pin the store. */}
      {storesLoaded && !shiftLoading && !storeId ? (
        <ChooseStoreModal stores={activeStores ?? []} onChoose={setChosenStoreId} />
      ) : (
        /* Blocks the till until the cashier counts a starting float. Held off
           while the current shift is still loading, so an already-open shift
           doesn't flash this modal before the fetch resolves. */
        !shiftLoading && !shift && !shiftError && storesLoaded && (
          <OpenShiftModal
            // Remounted per store so a float typed for one branch never
            // carries into another's.
            key={storeId ?? 'none'}
            suggested={suggestedFloat}
            onOpen={handleOpenShift}
            isPending={isOpening}
            // Only where there is a choice to make: a cashier sells from the
            // till they are assigned to, and one store is no choice at all.
            stores={posStore.canSwitch ? activeStores : undefined}
            storeId={storeId}
            onStoreChange={posStore.canSwitch ? setChosenStoreId : undefined}
            // Empty for a cashier, and for management whenever the server
            // already picked a till for them -- in both cases this is just
            // the open-shift dialog it has always been.
            joinable={joinable}
            onJoin={joinShift}
          />
        )
      )}

      {showCloseShift && shift && (
        <CloseShiftModal
          shift={shift}
          currency={user?.business?.currency}
          onClose={() => setShowCloseShift(false)}
          onConfirm={confirmCloseShift}
          isPending={isClosing}
        />
      )}

      {shift && (
        <CashMovementModal
          open={showCashMove}
          onClose={() => setShowCashMove(false)}
          onSubmit={recordCashMove}
          isPending={isMovingCash}
          movements={shift.movements ?? []}
        />
      )}

      {/* Expired item: other shops may sell it, after saying so. */}
      <ConfirmDialog
        open={!!expiredPrompt}
        title="This item has expired"
        description={
          expiredPrompt
            ? `${expiredPrompt.product.name} ${
                expiredPrompt.product.expiryDate
                  ? `expired on ${formatDate(expiredPrompt.product.expiryDate)}`
                  : 'is from an expired batch'
              }. Sell it anyway?`
            : undefined
        }
        confirmLabel="Sell anyway"
        destructive
        onConfirm={() => {
          if (!expiredPrompt) return;
          const { product: p, serial } = expiredPrompt;
          setOkExpired((s) => new Set(s).add(p.id));
          setExpiredPrompt(null);
          add(p, true, serial);
        }}
        onCancel={() => setExpiredPrompt(null)}
      />

      <ShortcutsHelp open={showHelp} onClose={() => setShowHelp(false)} />

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* Product picker */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:w-[60%]">
          {/* A shift left open across days mixes days' cash into one count, so a
              shortage can't be pinned to a day or to a person. Say so, with the
              way out right there. It sits in the product column so the cart
              keeps its full height. */}
          {staleShift && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
              <Clock className="h-4 w-4 shrink-0 text-warning" />
              <span className="min-w-0 flex-1">
                This shift has been open since <b>{formatDateTime(shift!.openedAt)}</b>. Close
                and count it so each day&apos;s cash is checked on its own.
              </span>
              <Button size="sm" variant="outline" onClick={() => setShowCloseShift(true)}>
                Close shift now
              </Button>
            </div>
          )}
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

          <ProductGrid
            categories={categories}
            categoryId={categoryId}
            onCategory={setCategoryId}
            products={displayProducts}
            loading={productsLoading}
            error={productsError}
            onRetry={() => refetchProducts()}
            stockLoaded={stockLoaded}
            onHand={onHand}
            reorderLevels={reorderLevels}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            onAdd={(p) => add(p)}
          />
        </div>

        {/* Cart — inline right column on lg+, slide-up sheet on smaller screens */}
        <div
          className={cn(
            'fixed inset-x-0 bottom-0 top-16 z-50 lg:static lg:inset-auto lg:z-auto lg:flex lg:min-h-0 lg:w-[40%] lg:flex-col',
            cartOpen ? 'pointer-events-auto' : 'pointer-events-none',
            'lg:pointer-events-auto',
          )}
          aria-hidden={cartHidden}
          inert={cartHidden}
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
              storeId={storeId ?? null}
              cartCount={cartCount}
              shiftOpen={!!shift}
              heldSales={heldSales}
              resumingId={resumeMutation.isPending ? (resumeMutation.variables ?? null) : null}
              discardingId={discardMutation.isPending ? (discardMutation.variables ?? null) : null}
              selectedCustomer={customerId ? selectedCustomer : undefined}
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
              onCheckout={completeSale}
              checkingOut={checkout.isPending}
              subtotal={subtotal}
              tax={tax}
              taxInclusive={taxInclusive}
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
              tenders={tenders}
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

      {/* Mobile only -- also the only way to reach the held-sales tray on
          small screens, so it stays while sales are parked. */}
      <MobileCartBar cartCount={cartCount} heldCount={heldSales.length} total={total} onOpen={() => setCartOpen(true)} />
    </div>
  );
}
