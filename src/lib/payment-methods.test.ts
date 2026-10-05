import { describe, expect, it } from 'vitest';
import { acceptedTenders } from './payment-methods';

const values = (list: { value: string }[]) => list.map((t) => t.value);

describe('acceptedTenders', () => {
  it('offers what a shop chose, cash always first', () => {
    expect(values(acceptedTenders(['CONNECTIPS', 'KHALTI']))).toEqual(['CASH', 'KHALTI', 'CONNECTIPS']);
  });

  it('falls back to cash, card and mobile for a shop that never chose', () => {
    expect(values(acceptedTenders(undefined))).toEqual(['CASH', 'CARD', 'MOBILE']);
  });

  it('keeps a turned-off tender a refund defaults to', () => {
    expect(values(acceptedTenders(['CASH'], 'KHALTI'))).toEqual(['CASH', 'KHALTI']);
  });
});
