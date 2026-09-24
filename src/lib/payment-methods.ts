import type { PaymentMethod } from '@/types';

/**
 * The tenders a balance can be settled with -- a customer paying down their
 * khata, or a supplier being paid. Credit and mixed don't apply to settling.
 * Cash is first because it is the default, and the only one that reaches a
 * till's expected cash.
 */
export const SETTLE_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'MOBILE', label: 'Mobile / QR' },
];
