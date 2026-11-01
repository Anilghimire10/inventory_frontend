import { describe, expect, it } from 'vitest';
import { clearanceFrom, clearanceOff } from './clearance';

describe('clearanceOff', () => {
  // 3 units of the marked-down batch first, then a fresh batch at full price.
  const tiers = [
    { quantity: 3, price: 80 },
    { quantity: 10, price: null },
  ];

  it('marks down only the units drawn from clearance stock', () => {
    expect(clearanceOff(tiers, 2, 100)).toBe(40);
    expect(clearanceOff(tiers, 5, 100)).toBe(60); // 3 marked down, 2 full price
  });

  it('marks down every unit of a product keeping one date on itself', () => {
    expect(clearanceOff([{ quantity: null, price: 75 }], 4, 100)).toBe(100);
  });

  it('takes nothing off when the cashier already priced the line lower', () => {
    expect(clearanceOff(tiers, 2, 70)).toBe(0);
  });

  it('is nothing without a markdown', () => {
    expect(clearanceOff(undefined, 2, 100)).toBe(0);
    expect(clearanceFrom(undefined)).toBeNull();
    expect(clearanceFrom(tiers)).toBe(80);
  });
});
