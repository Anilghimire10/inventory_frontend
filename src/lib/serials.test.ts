import { describe, expect, it } from 'vitest';
import { hasDuplicateSerials, parseSerials, serialsInvalid } from './serials';

describe('parseSerials', () => {
  it('splits on newlines and commas and trims', () => {
    expect(parseSerials('A1\nB2, C3')).toEqual(['A1', 'B2', 'C3']);
    expect(parseSerials('  A1  \n  B2  ')).toEqual(['A1', 'B2']);
  });

  it('drops blank lines rather than counting them as units', () => {
    expect(parseSerials('A1\n\n\nB2\n')).toEqual(['A1', 'B2']);
    expect(parseSerials('A1,,B2')).toEqual(['A1', 'B2']);
    expect(parseSerials('')).toEqual([]);
    expect(parseSerials('   \n  ')).toEqual([]);
  });
});

describe('hasDuplicateSerials', () => {
  it('spots a repeated serial', () => {
    expect(hasDuplicateSerials(['A1', 'A1'])).toBe(true);
    expect(hasDuplicateSerials(['A1', 'B2'])).toBe(false);
    expect(hasDuplicateSerials([])).toBe(false);
  });

  it('is case- and whitespace-sensitive, matching the server', () => {
    // The uniqueness index is on the exact string, so 'a1' and 'A1' are two
    // different units here and must stay that way.
    expect(hasDuplicateSerials(['A1', 'a1'])).toBe(false);
  });
});

describe('serialsInvalid', () => {
  it('needs exactly one distinct serial per unit', () => {
    expect(serialsInvalid(['A1', 'B2'], 2)).toBe(false);
    expect(serialsInvalid(['A1'], 2)).toBe(true);
    expect(serialsInvalid(['A1', 'B2', 'C3'], 2)).toBe(true);
    expect(serialsInvalid(['A1', 'A1'], 2)).toBe(true);
  });

  it('rejects quantities that cannot map to whole units', () => {
    // A fractional qty on a serialised line used to disable checkout forever
    // while the warning pointed at the serials, not the quantity.
    expect(serialsInvalid(['A1'], 1.5)).toBe(true);
    expect(serialsInvalid([], 0)).toBe(true);
    expect(serialsInvalid(['A1'], -1)).toBe(true);
    expect(serialsInvalid(['A1'], Number.NaN)).toBe(true);
  });

  it('rejects a decimal string quantity, so callers must coerce first', () => {
    // Documents the trap: quantities off the API are strings, and passing one
    // straight in fails `Number.isInteger`. Coercing is the caller's job.
    expect(serialsInvalid(['A1'], '1' as unknown as number)).toBe(true);
  });
});
