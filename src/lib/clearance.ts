import type { ClearanceTier } from '@/types';

/**
 * What clearance takes off a cart line.
 *
 * The till draws batches soonest-expiry first, so the first units of a line
 * come out of the stock that was marked down. The server sends the tiers in
 * that order -- how many units at what price -- and each unit drawn from a
 * marked-down tier is charged its clearance price instead of the line's.
 * Units past the tiers are full price. A clearance price above what the line
 * already charges (the cashier priced it lower) takes nothing off.
 */
export function clearanceOff(
  tiers: ClearanceTier[] | undefined,
  quantity: number,
  unitPrice: number,
): number {
  if (!tiers?.length) return 0;
  let left = quantity;
  let off = 0;
  for (const t of tiers) {
    if (left <= 0) break;
    const units = t.quantity === null ? left : Math.min(t.quantity, left);
    if (t.price !== null && t.price < unitPrice) off += (unitPrice - t.price) * units;
    left -= units;
  }
  return Math.round(off * 100) / 100;
}

/** The lowest clearance price on offer, for a badge; null when none. */
export function clearanceFrom(tiers: ClearanceTier[] | undefined): number | null {
  const prices = (tiers ?? []).map((t) => t.price).filter((p): p is number => p !== null);
  return prices.length ? Math.min(...prices) : null;
}
