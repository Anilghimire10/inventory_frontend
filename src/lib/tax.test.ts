import { describe, expect, it } from 'vitest';
import { splitTax } from './tax';

describe('splitTax', () => {
  it('adds tax on top when prices exclude it', () => {
    expect(splitTax(100, 13, false)).toEqual({ net: 100, tax: 13, total: 113 });
  });

  it('backs tax out when prices include it', () => {
    expect(splitTax(113, 13, true)).toEqual({ net: 100, tax: 13, total: 113 });
  });

  it('keeps the shelf price whole when the included tax rounds', () => {
    const { net, tax, total } = splitTax(100, 13, true);
    expect(tax).toBe(11.5);
    expect(total).toBe(100);
    expect(Math.round((net + tax) * 100) / 100).toBe(100);
  });

  it('leaves untaxed amounts alone either way', () => {
    expect(splitTax(50, 0, true)).toEqual({ net: 50, tax: 0, total: 50 });
    expect(splitTax(50, 0, false)).toEqual({ net: 50, tax: 0, total: 50 });
  });
});
