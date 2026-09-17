import { describe, expect, it } from 'vitest';
import { remainingQty, round3, toNum } from './decimal';

describe('toNum', () => {
  it('coerces the decimal strings Prisma actually sends', () => {
    // Real values observed on the wire: Decimal(12,3) columns arrive quoted.
    expect(toNum('2')).toBe(2);
    expect(toNum('-3')).toBe(-3);
    expect(toNum('2.500')).toBe(2.5);
    expect(toNum('0')).toBe(0);
  });

  it('passes numbers through', () => {
    expect(toNum(7)).toBe(7);
    expect(toNum(0)).toBe(0);
    expect(toNum(-1.25)).toBe(-1.25);
  });

  it('reads nothing as zero rather than NaN', () => {
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum('')).toBe(0);
    // A NaN leaking into a quantity input's max silently disables the control.
    expect(toNum('not a number')).toBe(0);
  });

  it('is what Number.isInteger needs — the check that broke Receive', () => {
    // `Number.isInteger('53')` is false, which is how a serialised purchase
    // line could never enable its Receive button.
    expect(Number.isInteger(toNum('53'))).toBe(true);
    expect(Number.isInteger(toNum('53.5'))).toBe(false);
  });

  it('orders correctly, unlike raw string comparison', () => {
    // '-3' >= 0 is false but '120' < '20' is true as strings; the movement
    // history coloured rows on exactly this comparison.
    expect(toNum('120') > toNum('20')).toBe(true);
    expect(toNum('-0.75') >= 0).toBe(false);
    expect(toNum('0') >= 0).toBe(true);
  });
});

describe('round3', () => {
  it('rounds to the schema precision', () => {
    expect(round3(0.1 + 0.2)).toBe(0.3);
    expect(round3(1.23456)).toBe(1.235);
    expect(round3(2)).toBe(2);
  });
});

describe('remainingQty', () => {
  it('subtracts what has already been returned', () => {
    expect(remainingQty({ quantity: '2', returnedQty: '0' })).toBe(2);
    expect(remainingQty({ quantity: '2', returnedQty: '1' })).toBe(1);
    expect(remainingQty({ quantity: '53', returnedQty: '53' })).toBe(0);
  });

  it('never goes negative', () => {
    expect(remainingQty({ quantity: '1', returnedQty: '3' })).toBe(0);
  });

  it('keeps float artefacts out of the input max', () => {
    // Without rounding this is 0.30000000000000004, which shows up in the UI.
    expect(remainingQty({ quantity: '0.5', returnedQty: '0.2' })).toBe(0.3);
  });

  it('accepts numbers as well as strings', () => {
    expect(remainingQty({ quantity: 4, returnedQty: 1.5 })).toBe(2.5);
  });
});
