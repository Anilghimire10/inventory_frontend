import type { CashMovementReason, CashMovementType } from '@/types';

/** What each reason reads as on the till and on a printed report. */
export const CASH_REASON_LABEL: Record<CashMovementReason, string> = {
  FLOAT_TOPUP: 'Added change',
  EXPENSE: 'Shop expense',
  SUPPLIER: 'Paid a supplier',
  SAFE_DROP: 'Moved to safe / bank',
  OWNER_DRAW: 'Owner took cash',
  OTHER: 'Other',
};

/** The reasons offered for each direction. Mirrors the API's check. */
export const CASH_REASONS: Record<CashMovementType, CashMovementReason[]> = {
  PAY_IN: ['FLOAT_TOPUP', 'OTHER'],
  PAY_OUT: ['EXPENSE', 'SUPPLIER', 'SAFE_DROP', 'OWNER_DRAW', 'OTHER'],
};

/**
 * Notes and coins in common use, largest first, for counting a drawer.
 *
 * Only for currencies listed here: a wrong set of notes is worse than none,
 * because a cashier would have to leave a real note out of the count. Any
 * other currency counts by typing the total, as before.
 */
const DENOMINATIONS: Record<string, number[]> = {
  NPR: [1000, 500, 100, 50, 20, 10, 5, 2, 1],
  INR: [500, 200, 100, 50, 20, 10, 5, 2, 1],
  PKR: [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1],
  BDT: [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1],
  LKR: [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1],
  USD: [100, 50, 20, 10, 5, 1, 0.25, 0.1, 0.05, 0.01],
  EUR: [500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01],
  GBP: [50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01],
};

export function denominationsFor(currency: string | undefined): number[] | null {
  return DENOMINATIONS[(currency ?? '').toUpperCase()] ?? null;
}

/**
 * The total of a count by denomination, to the cent.
 *
 * Summed in cents so 0.1 + 0.2 lands on 0.3: the API refuses a breakdown
 * that doesn't match the counted total exactly.
 */
export function countTotal(count: Record<string, number>): number {
  let cents = 0;
  for (const [denomination, qty] of Object.entries(count)) {
    cents += Math.round(Number(denomination) * 100) * (qty || 0);
  }
  return cents / 100;
}

/**
 * How long a shift can run before the till asks for it to be counted.
 *
 * A drawer left open across days mixes days' cash into one count, so a
 * shortage can't be pinned to a day or a person. Sixteen hours covers a
 * long trading day with room to spare; past it, the shift was forgotten.
 */
export const STALE_SHIFT_HOURS = 16;

export function isStaleShift(openedAt: string, now = Date.now()): boolean {
  return now - new Date(openedAt).getTime() > STALE_SHIFT_HOURS * 60 * 60 * 1000;
}
