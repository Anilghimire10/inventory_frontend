'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { SubscriptionApi } from '@/api';
import type { OnlineGateway, OnlinePaymentStart, SubscriptionOverview, SubscriptionPlan } from '@/types';
import { lengthLabel, money, savingPercent } from '@/lib/plans';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type Online = SubscriptionOverview['online'];

/** Each wallet in its own colour, so the button reads as that wallet at a glance. */
const GATEWAY_LOOK: Record<OnlineGateway, string> = {
  ESEWA: 'bg-[#60bb46] text-white hover:bg-[#55a73e]',
  KHALTI: 'bg-[#5c2d91] text-white hover:bg-[#4e267c]',
  CONNECTIPS: 'bg-[#0b4f9c] text-white hover:bg-[#093f7d]',
};

/** Every wallet we can take, in the order shown. One the server has no keys for says it is being set up. */
const ALL_GATEWAYS: { id: OnlineGateway; label: string }[] = [
  { id: 'ESEWA', label: 'eSewa' },
  { id: 'KHALTI', label: 'Khalti' },
  { id: 'CONNECTIPS', label: 'connectIPS' },
];


/** eSewa and connectIPS take a form post, not a link: build it and send the page there. */
function goTo(start: OnlinePaymentStart) {
  if (start.kind === 'redirect') {
    window.location.assign(start.url);
    return;
  }
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = start.action;
  for (const [name, value] of Object.entries(start.fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

/**
 * How long to pay for: the lengths `plan` is sold for, each with its price,
 * what that comes to a month, and what it saves against paying monthly.
 */
export function LengthPicker({
  plan,
  months,
  onChange,
}: {
  plan: SubscriptionPlan;
  months: number;
  onChange: (months: number) => void;
}) {
  return (
    <div role="radiogroup" aria-label="How long" className={cn('grid gap-2', plan.prices.length > 1 ? 'grid-cols-3' : 'grid-cols-1 sm:max-w-xs')}>
      {plan.prices.map((p) => {
        const selected = p.months === months;
        const save = savingPercent(plan, p.months);
        return (
          <button
            key={p.months}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(p.months)}
            className={cn(
              'relative rounded-lg border p-3 text-left transition-all duration-150',
              selected
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-border hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 hover:shadow-md',
            )}
          >
            {/* The saving as a corner badge where there's room; on a phone, a line of its own. */}
            {save > 0 && (
              <span className="absolute right-2 top-2 hidden rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success sm:inline">
                -{save}%
              </span>
            )}
            <span className="block text-xs text-muted-foreground">{lengthLabel(p.months)}</span>
            <span className="block text-base font-semibold">{money(plan.currency, p.amount)}</span>
            <span className="block text-[11px] text-muted-foreground">
              {p.months > 1 ? `${money(plan.currency, Math.round(p.amount / p.months))} a month` : 'billed monthly'}
            </span>
            {save > 0 && <span className="mt-0.5 block text-[11px] font-semibold text-success sm:hidden">save {save}%</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Pay online for `months` of `plan` with eSewa, Khalti or connectIPS
 * (straight from a bank account): the subscription is extended -- and the
 * shop moved onto the plan -- as soon as the payment goes through. No one
 * has to confirm it. `pass` is the lock screen's billing-only pass.
 */
export function PayOnline({
  online,
  plan,
  months,
  pass,
}: {
  online: Online;
  plan: SubscriptionPlan;
  months: number;
  pass?: string;
}) {
  const { show } = useToast();
  const [busy, setBusy] = useState<OnlineGateway | null>(null);
  // A length the plan isn't sold for falls back to its shortest.
  const price = plan.prices.find((p) => p.months === months) ?? plan.prices[0];
  const testMode = online.gateways.some((g) => g.test);

  // Back from the wallet's page, the browser can restore this page as it was
  // left -- button still spinning, every button disabled. Start fresh.
  useEffect(() => {
    const reset = () => setBusy(null);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  const pay = async (gateway: OnlineGateway) => {
    if (!price) return;
    setBusy(gateway);
    try {
      const start = await SubscriptionApi.startOnline(
        { gateway, planId: plan.id, months: price.months, returnOrigin: window.location.origin },
        pass,
      );
      goTo(start);
      // The page is on its way out; leave the button spinning.
    } catch (e) {
      show(apiError(e), 'error');
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {testMode && (
        <span className="inline-block rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
          Test mode: no real money
        </span>
      )}

      <div className="grid gap-2">
        {ALL_GATEWAYS.map((g) => {
          const live = online.gateways.find((o) => o.id === g.id);
          return live ? (
            <Button
              key={g.id}
              className={cn('w-full', GATEWAY_LOOK[g.id])}
              loading={busy === g.id}
              disabled={!!busy}
              onClick={() => pay(g.id)}
            >
              Pay with {live.label}
            </Button>
          ) : (
            // Looks and clicks like the others, but its keys aren't on the
            // server yet, so it says so rather than starting a payment.
            <Button
              key={g.id}
              className={cn('w-full', GATEWAY_LOOK[g.id])}
              disabled={!!busy}
              onClick={() =>
                show(
                  `${g.label} is being set up. Please pay with ${online.gateways.map((o) => o.label).join(' or ')} for now.`,
                  'info',
                )
              }
            >
              Pay with {g.label}
            </Button>
          );
        })}
      </div>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        You&apos;ll pay on {online.gateways.map((g) => g.label).join(' or ')}&apos;s own page, then come back here.
        Your subscription is extended as soon as the payment goes through.
      </p>
    </div>
  );
}
