/** Mirrors `api/src/common/units.ts` — keep the two lists in step. */
export const DISCRETE_UNITS = ['pcs', 'box', 'pkt', 'dozen', 'pair'] as const;
export const FRACTIONAL_UNITS = ['kg', 'g', 'l', 'ml', 'm', 'ft'] as const;
export const UNITS = [...DISCRETE_UNITS, ...FRACTIONAL_UNITS];

const FRACTIONAL = new Set<string>(FRACTIONAL_UNITS);

/** Measured goods sell in fractions; discrete ones are whole numbers only. */
export const allowsFraction = (unit: string | null | undefined): boolean =>
  FRACTIONAL.has((unit ?? '').trim().toLowerCase());

/** Step for a quantity input: 1 gram / 1 ml of resolution, or whole units. */
export const qtyStep = (unit: string | null | undefined): string =>
  allowsFraction(unit) ? '0.001' : '1';
