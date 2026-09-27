import { describe, expect, it } from 'vitest';
import { CASH_REASONS, countTotal, denominationsFor, isStaleShift } from './cash';

describe('countTotal', () => {
  it('adds notes and coins by denomination', () => {
    expect(countTotal({ '1000': 3, '100': 2, '5': 1 })).toBe(3205);
  });

  it('lands on the cent where floating point would not', () => {
    // 0.1 * 3 is 0.30000000000000004 in floats; the API compares exactly.
    expect(countTotal({ '0.1': 3, '0.05': 1 })).toBe(0.35);
  });

  it('treats a blank line as none', () => {
    expect(countTotal({ '500': 0, '100': Number.NaN })).toBe(0);
  });
});

describe('denominationsFor', () => {
  it('knows Nepali notes, largest first', () => {
    expect(denominationsFor('NPR')?.[0]).toBe(1000);
    expect(denominationsFor('npr')).toEqual(denominationsFor('NPR'));
  });

  it('offers nothing for a currency it does not know, rather than a wrong set', () => {
    expect(denominationsFor('JPY')).toBeNull();
    expect(denominationsFor(undefined)).toBeNull();
  });
});

describe('isStaleShift', () => {
  const now = new Date('2026-09-25T12:00:00Z').getTime();

  it('lets a normal trading day run', () => {
    expect(isStaleShift('2026-09-25T02:00:00Z', now)).toBe(false);
  });

  it('flags a shift left open overnight and beyond', () => {
    expect(isStaleShift('2026-09-22T11:49:00Z', now)).toBe(true);
  });
});

describe('CASH_REASONS', () => {
  it('never offers an expense as cash coming in', () => {
    expect(CASH_REASONS.PAY_IN).not.toContain('EXPENSE');
    expect(CASH_REASONS.PAY_OUT).not.toContain('FLOAT_TOPUP');
  });
});
