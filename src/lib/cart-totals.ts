import { splitTax } from './tax';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CartTotalsInput {
  /** Each line after its own discount, and the tax rate that applies to it (0 for none). */
  lines: { net: number; taxRate: number }[];
  /** Shelf prices already contain their tax. */
  taxInclusive: boolean;
  /** Bill discount as typed: an amount, or a percent. */
  discount: number;
  discountType: 'amount' | 'percent';
  /** Paid in full now, all on credit, or part now and the rest on credit. */
  payMode: 'full' | 'partial' | 'credit';
  /** What a part-paying customer hands over now. */
  amountPaid: number;
}

export interface CartTotals {
  subtotal: number;
  tax: number;
  discountAmount: number;
  total: number;
  /** Collected now. */
  paidNow: number;
  /** Left on the customer's account. */
  due: number;
}

/**
 * The till's arithmetic: what the bill comes to and how much of it is paid
 * now. Taxed per line the way the API charges a sale, so the screen and the
 * printed bill agree with what is recorded.
 */
export function cartTotals(input: CartTotalsInput): CartTotals {
  let sub = 0;
  let t = 0;
  for (const l of input.lines) {
    const split = splitTax(l.net, l.taxRate, input.taxInclusive);
    sub += split.net;
    t += split.tax;
  }
  const subtotal = round2(sub);
  const tax = round2(t);

  // A percentage comes off the prices the customer sees: before tax when tax
  // is added on top, the shelf total when prices already include it.
  let discountAmount = 0;
  if (input.discount > 0) {
    const base = input.taxInclusive ? subtotal + tax : subtotal;
    discountAmount = round2(input.discountType === 'percent' ? (base * input.discount) / 100 : input.discount);
  }

  const total = Math.max(0, round2(subtotal + tax - discountAmount));
  const paidNow =
    input.payMode === 'full' ? total : input.payMode === 'credit' ? 0 : Math.min(Math.max(input.amountPaid, 0), total);
  const due = Math.max(0, round2(total - paidNow));
  return { subtotal, tax, discountAmount, total, paidNow, due };
}
