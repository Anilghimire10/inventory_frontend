import type { SubscriptionPlan } from '@/types';

/** "1 month", "3 months", "1 year". */
export const lengthLabel = (months: number) => (months === 12 ? '1 year' : `${months} month${months === 1 ? '' : 's'}`);

/** "a month", "3 months", "a year": after a price. */
export const perLabel = (months: number) => (months === 12 ? 'a year' : months === 1 ? 'a month' : `${months} months`);

export const money = (currency: string, n: number) =>
  `${currency} ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** "Up to 3 branches", "1 branch", "Unlimited branches". */
export const branchesLabel = (maxStores: number | null) =>
  maxStores === null ? 'Unlimited branches' : maxStores === 1 ? '1 branch' : `Up to ${maxStores} branches`;

/**
 * How much a longer length saves against paying monthly, as a whole percent;
 * 0 when there is no monthly price to compare with, or it saves nothing.
 */
export function savingPercent(plan: SubscriptionPlan, months: number): number {
  const monthly = plan.prices.find((p) => p.months === 1)?.amount;
  const price = plan.prices.find((p) => p.months === months)?.amount;
  if (!monthly || !price || months === 1) return 0;
  const saving = 1 - price / (monthly * months);
  return saving > 0.005 ? Math.round(saving * 100) : 0;
}

/** Whether a shop with `activeStores` open can choose `plan`: not if it allows fewer. */
export const planFits = (plan: SubscriptionPlan, activeStores: number) =>
  plan.maxStores === null || activeStores <= plan.maxStores;

/**
 * The plan to start on: the shop's own if it can still choose it, else the
 * first it fits, else the first.
 */
export function defaultPlan(plans: SubscriptionPlan[], currentId: string | null | undefined, activeStores: number) {
  return (
    plans.find((p) => p.id === currentId && planFits(p, activeStores)) ??
    plans.find((p) => planFits(p, activeStores)) ??
    plans[0] ??
    null
  );
}
