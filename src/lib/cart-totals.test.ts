import { describe, expect, it } from 'vitest';
import { cartTotals, type CartTotalsInput } from './cart-totals';

const base: CartTotalsInput = {
  lines: [],
  taxInclusive: false,
  discount: 0,
  discountType: 'amount',
  payMode: 'full',
  amountPaid: 0,
};

describe('cartTotals', () => {
  it('adds tax on top per line when prices exclude it', () => {
    const t = cartTotals({ ...base, lines: [{ net: 100, taxRate: 13 }, { net: 50, taxRate: 0 }] });
    expect(t).toMatchObject({ subtotal: 150, tax: 13, total: 163, paidNow: 163, due: 0 });
  });

  it('backs the tax out of shelf prices that already include it', () => {
    const t = cartTotals({ ...base, taxInclusive: true, lines: [{ net: 113, taxRate: 13 }] });
    expect(t).toMatchObject({ subtotal: 100, tax: 13, total: 113 });
  });

  it('takes a percent discount off the pre-tax amount when tax goes on top', () => {
    const t = cartTotals({ ...base, lines: [{ net: 200, taxRate: 13 }], discount: 10, discountType: 'percent' });
    // 10% of 200, not of 226.
    expect(t.discountAmount).toBe(20);
    expect(t.total).toBe(206);
  });

  it('takes a percent discount off the shelf total when prices include tax', () => {
    const t = cartTotals({
      ...base,
      taxInclusive: true,
      lines: [{ net: 226, taxRate: 13 }],
      discount: 10,
      discountType: 'percent',
    });
    expect(t.discountAmount).toBe(22.6);
    expect(t.total).toBe(203.4);
  });

  it('never lets a discount push the bill below zero', () => {
    const t = cartTotals({ ...base, lines: [{ net: 50, taxRate: 0 }], discount: 80 });
    expect(t.total).toBe(0);
    expect(t.due).toBe(0);
  });

  it('splits a part payment between now and the customer account', () => {
    const t = cartTotals({ ...base, lines: [{ net: 500, taxRate: 0 }], payMode: 'partial', amountPaid: 120 });
    expect(t).toMatchObject({ paidNow: 120, due: 380 });
  });

  it('caps a part payment at the total, and reads a negative one as nothing', () => {
    expect(cartTotals({ ...base, lines: [{ net: 100, taxRate: 0 }], payMode: 'partial', amountPaid: 150 }))
      .toMatchObject({ paidNow: 100, due: 0 });
    expect(cartTotals({ ...base, lines: [{ net: 100, taxRate: 0 }], payMode: 'partial', amountPaid: -5 }))
      .toMatchObject({ paidNow: 0, due: 100 });
  });

  it('puts the whole bill on credit', () => {
    expect(cartTotals({ ...base, lines: [{ net: 75.5, taxRate: 0 }], payMode: 'credit' }))
      .toMatchObject({ paidNow: 0, due: 75.5 });
  });

  it('rounds to cents without drifting on many small lines', () => {
    const lines = Array.from({ length: 10 }, () => ({ net: 0.1, taxRate: 0 }));
    expect(cartTotals({ ...base, lines }).total).toBe(1);
  });
});
