import { describe, expect, it } from 'vitest';
import { allowsFraction, DISCRETE_UNITS, FRACTIONAL_UNITS, qtyStep, UNITS } from './units';

describe('allowsFraction', () => {
  it('allows fractions for measured goods only', () => {
    for (const u of FRACTIONAL_UNITS) expect(allowsFraction(u)).toBe(true);
    for (const u of DISCRETE_UNITS) expect(allowsFraction(u)).toBe(false);
  });

  it('normalises case and surrounding space', () => {
    expect(allowsFraction(' KG ')).toBe(true);
    expect(allowsFraction('Kg')).toBe(true);
  });

  it('treats an unknown or missing unit as discrete', () => {
    // Safer default: a product with no unit shouldn't accept half a piece.
    expect(allowsFraction(null)).toBe(false);
    expect(allowsFraction(undefined)).toBe(false);
    expect(allowsFraction('')).toBe(false);
    expect(allowsFraction('kilo')).toBe(false);
  });
});

describe('qtyStep', () => {
  it('gives gram/millilitre resolution to measured goods', () => {
    expect(qtyStep('kg')).toBe('0.001');
    expect(qtyStep('pcs')).toBe('1');
  });
});

describe('UNITS', () => {
  it('has no duplicates across the two lists', () => {
    expect(new Set(UNITS).size).toBe(UNITS.length);
  });
});
