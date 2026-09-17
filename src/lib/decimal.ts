/**
 * Prisma passes `Decimal` columns through as **strings**, so anything the API
 * models as `Decimal(12,3)` — stock, sale and purchase quantities — arrives as
 * `'2'`, not `2`. Arithmetic with `-` or `*` coerces and appears to work, which
 * is why this keeps going unnoticed; `Number.isInteger` and `>=` do not, which
 * is how it has bitten (a Receive button that could never enable, movement rows
 * coloured by string comparison).
 *
 * The rule is "whatever Prisma passes through raw is a string" — see the
 * `Decimal` fields in types.ts. These helpers make the coercion explicit at the
 * point of use instead of relying on an operator to do it silently.
 */

/** Coerce an API decimal (string or number) to a number; nullish reads as 0. */
export function toNum(value: string | number | null | undefined): number {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Round to the schema's 3 decimal places, so float artefacts stay out of the UI. */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * How much of a sale or purchase line can still be returned: the quantity less
 * what has already gone back, never negative, at the schema's precision. Used
 * as the `max` of a quantity input, so an artefact like 0.30000000000000004
 * would be visible.
 */
export function remainingQty(line: {
  quantity: string | number;
  returnedQty: string | number;
}): number {
  return Math.max(0, round3(toNum(line.quantity) - toNum(line.returnedQty)));
}
