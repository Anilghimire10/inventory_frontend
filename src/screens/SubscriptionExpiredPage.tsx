'use client';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CalendarX, Mail, Phone } from 'lucide-react';
import { SubscriptionApi } from '@/api';
import { Button } from '@/components/ui/button';
import { LoadingBlock } from '@/components/ui/misc';
import { LengthPicker, PayOnline } from '@/components/subscription/PayOnline';
import { PayDirectly } from '@/components/subscription/HowToPay';
import { PlanPicker } from '@/components/subscription/PlanPicker';
import { defaultPlan, planFits } from '@/lib/plans';
import { ReportPayment } from '@/components/subscription/ReportPayment';
import { blockSnapshot, parseBlock } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { AuthShell } from './LoginPage';

/**
 * Where a shop lands when its subscription stops it -- at sign-in, or mid-
 * session once the grace period runs out. Before this it was bounced to the
 * login form with a one-line error, which it could not get past and which
 * said nothing about how to fix it.
 *
 * An owner or manager arrives with a billing-only pass (the API's refusal
 * carries one), which opens just the Subscription routes: so this screen
 * can take an eSewa or Khalti payment, while the rest of the app stays
 * locked.
 */
const noSubscribe = () => () => {};

export default function SubscriptionExpiredPage() {
  const router = useRouter();
  // Written once before navigating here, so there is nothing to subscribe
  // to; the server snapshot is null because prerendering has no storage.
  const raw = useSyncExternalStore(
    noSubscribe,
    blockSnapshot,
    () => null,
  );
  const block = useMemo(() => parseBlock(raw), [raw]);
  const pass = block?.billingToken;

  const sub = useQuery({
    queryKey: ['subscription', 'locked', pass],
    queryFn: () => SubscriptionApi.overview(pass),
    enabled: !!pass,
    retry: false,
  });

  const expired = block?.reason === 'expired';
  const { email, phone } = block?.contact ?? {};
  const data = sub.data;
  const [pickedId, setPickedId] = useState<string | null>(null);
  const plan = data
    ? (data.plans.find((p) => p.id === pickedId && planFits(p, data.activeStores)) ??
      defaultPlan(data.plans, data.currentPlan?.id, data.activeStores))
    : null;
  const inOtherCurrency = !!data && !!plan && plan.currency !== data.online.currency;
  const canPayOnline = !!data && data.online.gateways.length > 0 && !!plan && !inOtherCurrency;
  const [pickedMonths, setPickedMonths] = useState(1);
  const months = plan?.prices.some((p) => p.months === pickedMonths) ? pickedMonths : (plan?.prices[0]?.months ?? 1);

  return (
    <AuthShell>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
        <CalendarX className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        {expired ? 'Your subscription has ended' : 'Your subscription is inactive'}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {expired && block?.endedAt
          ? `It ended on ${formatDate(block.endedAt)}, and the app is paused until it's renewed.`
          : "The app is paused until it's renewed."}{' '}
        Your data is safe: nothing has been deleted, and everything will be back as soon as it
        is.
      </p>

      {pass && (
        <div className="mt-6 space-y-4 rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">To renew</p>
          {sub.isLoading ? (
            <LoadingBlock />
          ) : sub.isError || !sub.data ? (
            // The pass lasts about an hour; after that, signing in again gets a new one.
            <p className="text-sm text-muted-foreground">
              This page has been open a while. Sign in again to see how to pay.
            </p>
          ) : (
            <>
              {sub.data.plans.length > 0 && (
                <PlanPicker
                  compact
                  plans={sub.data.plans}
                  currentId={sub.data.currentPlan?.id ?? null}
                  activeStores={sub.data.activeStores}
                  selectedId={plan?.id ?? null}
                  onSelect={setPickedId}
                />
              )}
              {plan && <LengthPicker plan={plan} months={months} onChange={setPickedMonths} />}
              {canPayOnline ? (
                <PayOnline key={plan!.id} online={sub.data.online} plan={plan!} months={months} pass={pass} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {inOtherCurrency
                    ? 'Your plan is priced in US dollars, and eSewa, Khalti and connectIPS take rupees only. Pay by bank transfer or another way, then tap “I’ve paid”.'
                    : 'Online payment isn’t available right now. Get in touch below and we’ll help you renew.'}
                </p>
              )}
              <div className="space-y-3 border-t border-border pt-4">
                <p className="text-sm font-medium">Or pay by bank or QR</p>
                <PayDirectly payment={sub.data.payment} />
                <ReportPayment sub={sub.data} plan={plan} months={months} pass={pass} />
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-medium">{pass ? 'Questions?' : 'To renew'}</p>
        {email || phone ? (
          <ul className="mt-2 space-y-1.5 text-sm">
            {email && (
              <li>
                <a href={`mailto:${email}`} className="inline-flex items-center gap-2 text-primary hover:underline">
                  <Mail className="h-4 w-4" /> {email}
                </a>
              </li>
            )}
            {phone && (
              <li>
                <a href={`tel:${phone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-2 text-primary hover:underline">
                  <Phone className="h-4 w-4" /> {phone}
                </a>
              </li>
            )}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Contact the Inventory Manager team.</p>
        )}
        {!pass && (
          <p className="mt-3 text-xs text-muted-foreground">
            Not the owner? Ask your shop owner to renew.
          </p>
        )}
      </div>

      <Button className="mt-6 w-full" onClick={() => router.replace('/login')}>
        Sign in again
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Already renewed? Sign in again and you&apos;ll be straight back in.
      </p>
    </AuthShell>
  );
}
