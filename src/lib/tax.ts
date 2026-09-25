/** Round to cents. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Split a line amount into its pre-tax part and its tax -- the same rule the
 * API prices a sale with (`inventory_backend/src/common/tax.ts`), so the POS
 * preview and the printed bill match what gets charged.
 *
 * Exclusive (the default): `amount` is before tax and tax goes on top.
 * Inclusive: `amount` is what the customer pays and already holds the tax,
 * so the tax is backed out of it -- 113 at 13% is 100 + 13.
 *
 * Tax is rounded per line; `amount` is used as given, so callers round sums.
 */
export function splitTax(
  amount: number,
  rate: number,
  inclusive: boolean,
): { net: number; tax: number; total: number } {
  if (!rate) return { net: amount, tax: 0, total: amount };
  if (inclusive) {
    const tax = round2((amount * rate) / (100 + rate));
    return { net: amount - tax, tax, total: amount };
  }
  const tax = round2((amount * rate) / 100);
  return { net: amount, tax, total: round2(amount + tax) };
}
