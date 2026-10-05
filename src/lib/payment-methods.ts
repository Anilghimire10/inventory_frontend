import type { PaymentMethod, SettleMethod } from '@/types';

/**
 * The tenders a balance can be settled with -- a customer paying down their
 * khata, or a supplier being paid. Credit and mixed don't apply to settling.
 * Cash is first because it is the default, and the only one that reaches a
 * till's expected cash.
 */
export const SETTLE_METHODS: { value: SettleMethod; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'MOBILE', label: 'Mobile / QR' },
  { value: 'KHALTI', label: 'Khalti' },
  { value: 'CONNECTIPS', label: 'connectIPS' },
];

/** What a shop that has never chosen takes: the tenders every shop had before Khalti and connectIPS. */
const DEFAULT_ACCEPTED: PaymentMethod[] = ['CASH', 'CARD', 'MOBILE'];

/**
 * The tenders a shop takes (Settings -> Payment methods), in picker order.
 * Cash is always in. `keep` stays listed even if the shop has since turned it
 * off -- a refund defaults to the tender the sale was paid on.
 */
export function acceptedTenders(accepted?: PaymentMethod[] | null, keep?: PaymentMethod) {
  const on = accepted?.length ? accepted : DEFAULT_ACCEPTED;
  return SETTLE_METHODS.filter((m) => m.value === 'CASH' || on.includes(m.value) || m.value === keep);
}

/** Every tender by name, for places that list what money came in on (shift totals, the Z report). */
export const TENDER_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  MOBILE: 'Mobile / QR',
  KHALTI: 'Khalti',
  CONNECTIPS: 'connectIPS',
  CREDIT: 'Credit',
  MIXED: 'Part credit',
};
