'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Check, Lock, Store, X } from 'lucide-react';
import type { SubscriptionPlan } from '@/types';
import { branchesLabel, money, perLabel, planFits, savingPercent } from '@/lib/plans';
import { cn } from '@/lib/utils';

/**
 * The plans side by side: price per length, what's included, the branch
 * limit. Pick one to pay for it. The shop's current plan is marked. A plan
 * allowing fewer branches than the shop has open can still be clicked, but
 * instead of being picked it explains why not, and how to make it possible.
 */
export function PlanPicker({
  plans,
  currentId,
  activeStores,
  selectedId,
  onSelect,
  compact = false,
}: {
  plans: SubscriptionPlan[];
  currentId: string | null;
  activeStores: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** One column, no features: the lock screen's narrow card. */
  compact?: boolean;
}) {
  // The plan last clicked that can't be chosen, for the notice under the cards.
  const [blocked, setBlocked] = useState<SubscriptionPlan | null>(null);
  return (
    <div className="space-y-3">
      <div
        role="radiogroup"
        aria-label="Plan"
        className={cn(
          'grid gap-3',
          !compact && plans.length > 1 && 'sm:grid-cols-2',
          !compact && plans.length > 2 && 'xl:grid-cols-3',
        )}
      >
        {plans.map((p) => {
          const fits = planFits(p, activeStores);
          const selected = p.id === selectedId;
          const current = p.id === currentId;
          const body = (
            <>
              <span className="flex items-start justify-between gap-2">
                <span className="text-base font-semibold text-foreground">{p.name}</span>
                {!fits ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <Lock className="h-3 w-3" /> Not available
                  </span>
                ) : current ? (
                  <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                    Your plan
                  </span>
                ) : selected ? (
                  <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                    Selected
                  </span>
                ) : null}
              </span>
              {p.description && <span className="mt-0.5 text-xs text-muted-foreground">{p.description}</span>}

              <span className="mt-3 space-y-0.5">
                {p.prices.map((x) => {
                  const save = savingPercent(p, x.months);
                  return (
                    <span key={x.months} className="flex items-baseline justify-between gap-2 text-sm">
                      <span>
                        <span className="font-semibold text-foreground">{money(p.currency, x.amount)}</span>{' '}
                        <span className="text-muted-foreground">{perLabel(x.months)}</span>
                      </span>
                      {save > 0 && <span className="text-[11px] font-medium text-success">save {save}%</span>}
                    </span>
                  );
                })}
              </span>

              <span className="mt-3 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Store className="h-3.5 w-3.5 text-primary" /> {branchesLabel(p.maxStores)}
              </span>
              {!compact && p.features.length > 0 && (
                <span className="mt-2 space-y-1">
                  {p.features.map((f, i) => (
                    <span key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> {f}
                    </span>
                  ))}
                </span>
              )}
            </>
          );
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              // Too small for the branches open: clicking explains why, rather than picking it.
              onClick={() => {
                if (fits) {
                  setBlocked(null);
                  onSelect(p.id);
                } else {
                  setBlocked(p);
                }
              }}
              className={cn(
                'flex flex-col rounded-xl border p-4 text-left transition-all duration-150',
                selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border',
                fits
                  ? 'hover:-translate-y-1 hover:border-primary hover:bg-primary/5 hover:shadow-lg'
                  : cn(
                      'border-dashed hover:border-warning hover:bg-warning/5',
                      blocked?.id === p.id && 'border-warning bg-warning/5',
                    ),
              )}
            >
              <span className={cn('flex flex-col', !fits && 'opacity-60')}>{body}</span>
            </button>
          );
        })}
      </div>
      {/* The server converts the days left on a switch (convertedEnd): say so before they pay. */}
      {currentId && selectedId && selectedId !== currentId && plans.some((p) => p.id === currentId) && (
        <p className="text-xs text-muted-foreground">
          Switching plans: the new plan starts as soon as you pay. Any days left on your current plan are converted at
          the two plans&apos; prices and added on, so you don&apos;t lose what you&apos;ve paid for.
        </p>
      )}
      {blocked && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">You can&apos;t choose {blocked.name} right now</p>
            <p className="mt-0.5 text-muted-foreground">
              {blocked.name} allows {blocked.maxStores === 1 ? '1 branch' : `${blocked.maxStores} branches`}, and your
              shop has {activeStores} open. To switch to it, close{' '}
              {activeStores - (blocked.maxStores ?? 0) === 1
                ? 'a branch'
                : `${activeStores - (blocked.maxStores ?? 0)} branches`}{' '}
              first
              {compact ? ' in Settings once you’ve renewed.' : ', then come back here.'}
            </p>
            {!compact && (
              <Link href="/settings" className="mt-1.5 inline-block font-medium text-primary hover:underline">
                Manage branches in Settings →
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={() => setBlocked(null)}
            aria-label="Close"
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
