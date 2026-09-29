import type { Product } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far ahead counts as "expiring soon". Matches the API's EXPIRY_SOON_DAYS. */
export const EXPIRY_SOON_DAYS = 30;

/**
 * An expiry date is the last day stock may be sold: expired once that whole
 * day is over. Dates are stored as midnight UTC of the day picked, so the day
 * ends 24 hours later -- the API's `isExpired` rule.
 */
export function isExpired(iso: string | null | undefined, now = Date.now()): boolean {
  return !!iso && new Date(iso).getTime() + DAY_MS <= now;
}

/** Whole days left to sell, counting today: 0 on the expiry day itself. */
export function daysToExpiry(iso: string, now = Date.now()): number {
  return Math.max(Math.ceil((new Date(iso).getTime() + DAY_MS - now) / DAY_MS) - 1, 0);
}

export type ExpiryState =
  | { kind: 'expired'; label: string; date: string | null }
  /** Some stock is expired, some isn't: the in-date part can still be sold. */
  | { kind: 'partial'; label: string; expiredQty: number }
  | { kind: 'soon'; label: string; date: string; days: number };

/**
 * What to warn about for a product: its own expiry date, and -- for batch
 * tracking -- stock in expired batches and the next batch to expire.
 * `onHand` is the shelf count where known (the till's store).
 */
export function productExpiry(p: Product, onHand?: number, now = Date.now()): ExpiryState | null {
  if (isExpired(p.expiryDate, now)) return { kind: 'expired', label: 'Expired', date: p.expiryDate ?? null };
  const expiredQty = p.trackBatches ? (p.expiry?.expiredQty ?? 0) : 0;
  if (expiredQty > 0) {
    if (onHand != null && onHand - expiredQty <= 0) return { kind: 'expired', label: 'Expired', date: null };
    return { kind: 'partial', label: `${expiredQty} expired`, expiredQty };
  }
  const dates = [p.expiryDate, p.trackBatches ? p.expiry?.nextBatchExpiry : null].filter(
    (d): d is string => !!d,
  );
  if (!dates.length) return null;
  const next = dates.reduce((a, b) => (new Date(a) < new Date(b) ? a : b));
  const days = daysToExpiry(next, now);
  if (days > EXPIRY_SOON_DAYS) return null;
  return {
    kind: 'soon',
    label: days === 0 ? 'Expires today' : `Expires in ${days}d`,
    date: next,
    days,
  };
}

/** Badge colours per state: red for expired, amber for the rest. */
export const EXPIRY_TONE = {
  expired: 'bg-destructive text-destructive-foreground',
  partial: 'bg-warning text-warning-foreground',
  soon: 'bg-warning/15 text-warning',
} as const;
