'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Boxes, Check, ChevronRight, CreditCard, Package, Rocket, ShoppingCart, Users, X } from 'lucide-react';
import { BusinessApi } from '@/api';
import type { BusinessSetup } from '@/types';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type StepKey = keyof BusinessSetup;

const STEPS: { key: StepKey; title: string; hint: string; href: string; icon: typeof Package }[] = [
  { key: 'products', title: 'Add your products', hint: 'What you sell, with prices. Import a spreadsheet if you have one.', href: '/products', icon: Package },
  { key: 'stock', title: 'Put stock on the shelf', hint: 'How many of each you have now: import it, or receive a purchase.', href: '/inventory', icon: Boxes },
  { key: 'paymentMethods', title: 'Choose how customers pay', hint: 'Cash, card, QR, Khalti, connectIPS -- only these show at checkout.', href: '/settings', icon: CreditCard },
  { key: 'staff', title: 'Add your staff', hint: 'Cashiers and stock keepers get their own login. Skip it if you work alone.', href: '/users', icon: Users },
  { key: 'sale', title: 'Make your first sale', hint: 'Open a shift at the POS and ring up a bill.', href: '/pos', icon: ShoppingCart },
];

/**
 * What this browser remembers per shop: the card hidden, and steps the owner
 * has looked at that the data can't show (keeping the default payment
 * methods is a choice too). Storage can be missing or throw; then nothing is
 * remembered and the card simply shows.
 */
type Local = { hidden?: boolean; seen?: StepKey[] };
const storageKey = (businessId: string) => `getting-started:${businessId}`;
function readLocal(businessId: string): Local {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey(businessId)) ?? '{}') as Local;
  } catch {
    return {};
  }
}
function writeLocal(businessId: string, next: Local) {
  try {
    window.localStorage.setItem(storageKey(businessId), JSON.stringify(next));
  } catch {
    // Not remembered; the card comes back next visit.
  }
}

/**
 * Getting started, on the Dashboard for owners and managers: a new shop's
 * first steps, each ticked from real data as it is done. Gone once they all
 * are, or when hidden.
 */
export function GettingStarted({ businessId }: { businessId: string }) {
  const [local, setLocal] = useState<Local>(() => (typeof window === 'undefined' ? {} : readLocal(businessId)));
  const { data } = useQuery({ queryKey: ['business-setup'], queryFn: () => BusinessApi.setup() });

  const update = (next: Local) => {
    setLocal(next);
    writeLocal(businessId, next);
  };

  if (!data || local.hidden) return null;
  const done = (k: StepKey) => data[k] || !!local.seen?.includes(k);
  const count = STEPS.filter((s) => done(s.key)).length;
  if (count === STEPS.length) return null;

  return (
    <Card className="mb-6 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Rocket className="h-5 w-5 text-primary" /> Getting started
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {count} of {STEPS.length} done. A few steps and your shop is ready to sell.
          </p>
        </div>
        <button
          type="button"
          onClick={() => update({ ...local, hidden: true })}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Hide getting started"
          title="Hide"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(count / STEPS.length) * 100}%` }} />
      </div>

      <ol className="mt-4 divide-y divide-border">
        {STEPS.map((s) => {
          const ok = done(s.key);
          const Icon = s.icon;
          return (
            <li key={s.key}>
              <Link
                href={s.href}
                onClick={() => {
                  // Looking at payment methods counts: the defaults may be just right.
                  if (s.key === 'paymentMethods' && !ok) update({ ...local, seen: [...(local.seen ?? []), s.key] });
                }}
                className="group flex items-center gap-3 py-3"
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    ok ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary',
                  )}
                >
                  {ok ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm font-medium', ok && 'text-muted-foreground line-through')}>
                    {s.title}
                  </span>
                  {!ok && <span className="block text-xs text-muted-foreground">{s.hint}</span>}
                </span>
                {!ok && (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
