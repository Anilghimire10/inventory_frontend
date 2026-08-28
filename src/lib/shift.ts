import type { PaymentMethod } from '@/types';

/**
 * Frontend-only cash drawer session, persisted to localStorage (per browser).
 * No backend yet -- see Tasks.md #3. Shaped to drop in a real /shifts API
 * later without touching the callers (ShiftContext is the only thing that
 * knows this is localStorage today).
 */
export interface Shift {
  id: string;
  storeId: string;
  openedByUserId: string;
  openedByName: string;
  openedAt: string;
  closedAt?: string;
  openingFloat: number;
  note?: string;
  // Running totals, updated as each sale completes during the shift.
  salesCount: number;
  grossSales: number;
  cashSales: number;
  cardSales: number;
  mobileSales: number;
  creditSales: number;
  // Close-out.
  countedCash?: number;
  expectedCash?: number;
  variance?: number;
}

const currentKey = (businessId: string, storeId: string) =>
  `pos:shift:current:${businessId}:${storeId}`;
const historyKey = (businessId: string) => `pos:shift:history:${businessId}`;

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable (private browsing) -- shift state just
    // won't survive a refresh; not worth surfacing an error for.
  }
}

export function loadCurrentShift(businessId: string, storeId: string): Shift | null {
  return read<Shift | null>(currentKey(businessId, storeId), null);
}

export function saveCurrentShift(businessId: string, storeId: string, shift: Shift | null) {
  if (shift) write(currentKey(businessId, storeId), shift);
  else window.localStorage.removeItem(currentKey(businessId, storeId));
}

export function loadShiftHistory(businessId: string): Shift[] {
  return read<Shift[]>(historyKey(businessId), []);
}

export function appendShiftHistory(businessId: string, shift: Shift) {
  const history = loadShiftHistory(businessId);
  write(historyKey(businessId), [shift, ...history]);
}

/**
 * Tally one completed sale into a shift's running totals.
 *
 * `tender` is the cashier's selected payment method for whatever was
 * collected *now* (`amountPaid`) -- not the server's recomputed
 * `sale.paymentMethod`, which relabels a part-paid sale as MIXED and would
 * make it impossible to tell how much of it was physically cash. Whatever
 * of `total` isn't in `amountPaid` went on the customer's account, so it
 * never touches the drawer regardless of tender.
 */
export function tallySale(
  shift: Shift,
  sale: { total: number; amountPaid: number; tender: PaymentMethod },
): Shift {
  const left = Math.max(0, sale.total - sale.amountPaid);
  return {
    ...shift,
    salesCount: shift.salesCount + 1,
    grossSales: shift.grossSales + sale.total,
    cashSales: shift.cashSales + (sale.tender === 'CASH' ? sale.amountPaid : 0),
    cardSales: shift.cardSales + (sale.tender === 'CARD' ? sale.amountPaid : 0),
    mobileSales: shift.mobileSales + (sale.tender === 'MOBILE' ? sale.amountPaid : 0),
    creditSales: shift.creditSales + left,
  };
}
