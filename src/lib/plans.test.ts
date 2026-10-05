import { describe, expect, it } from 'vitest';
import type { SubscriptionPlan } from '@/types';
import { defaultPlan, planFits, savingPercent } from './plans';

const plan = (id: string, maxStores: number | null, prices: [number, number][]): SubscriptionPlan => ({
  id,
  name: id,
  description: null,
  features: [],
  maxStores,
  currency: 'NPR',
  prices: prices.map(([months, amount]) => ({ months, amount })),
});

const basic = plan('basic', 1, [[1, 2000], [3, 5700], [12, 20000]]);
const business = plan('business', 3, [[1, 3500]]);
const chain = plan('chain', null, [[12, 60000]]);

describe('savingPercent', () => {
  it('compares a longer length with paying monthly', () => {
    expect(savingPercent(basic, 3)).toBe(5);
    expect(savingPercent(basic, 12)).toBe(17);
  });

  it('is 0 for the monthly price, or with no monthly price to compare', () => {
    expect(savingPercent(basic, 1)).toBe(0);
    expect(savingPercent(chain, 12)).toBe(0);
  });
});

describe('plans and branches', () => {
  it('a plan fits when it allows at least the branches open', () => {
    expect(planFits(basic, 1)).toBe(true);
    expect(planFits(basic, 2)).toBe(false);
    expect(planFits(chain, 50)).toBe(true);
  });

  it("starts on the shop's own plan, unless it no longer fits", () => {
    expect(defaultPlan([basic, business], 'business', 2)?.id).toBe('business');
    expect(defaultPlan([basic, business, chain], 'basic', 2)?.id).toBe('business');
    expect(defaultPlan([basic, business], null, 1)?.id).toBe('basic');
  });
});
