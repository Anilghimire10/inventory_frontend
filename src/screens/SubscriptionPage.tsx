'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Landmark,
  LifeBuoy,
  Lock,
  Mail,
  Phone,
  Printer,
  ReceiptText,
  Sparkles,
  Zap,
} from 'lucide-react';
import { SubscriptionApi } from '@/api';
import type { SubscriptionOverview, SubscriptionPlan } from '@/types';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { printSubscriptionReceipt } from '@/lib/print';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { LengthPicker, PayOnline } from '@/components/subscription/PayOnline';
import { PayDirectly } from '@/components/subscription/HowToPay';
import { PlanPicker } from '@/components/subscription/PlanPicker';
import { defaultPlan, lengthLabel, money, planFits } from '@/lib/plans';
import { ReportPayment } from '@/components/subscription/ReportPayment';
import { PageHeader, LoadingBlock, EmptyState, ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where the shop's subscription stands, all the time -- not only when the
 * banner decides it's worth a warning. Owners and managers: they renew.
 */
export default function SubscriptionPage() {
  const { user } = useAuth();
  const allowed = !!user && can.viewSubscription(user.role);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => SubscriptionApi.overview(),
    enabled: allowed,
  });
  // The plan being paid for: the owner's pick, else their own plan (or the first that fits).
  const [pickedId, setPickedId] = useState<string | null>(null);
  // How long to pay for; a length the plan isn't sold for falls back to its shortest.
  const [pickedMonths, setPickedMonths] = useState(1);
  const plan = data
    ? (data.plans.find((p) => p.id === pickedId && planFits(p, data.activeStores)) ??
      defaultPlan(data.plans, data.currentPlan?.id, data.activeStores))
    : null;
  const months = plan?.prices.some((p) => p.months === pickedMonths) ? pickedMonths : (plan?.prices[0]?.months ?? 1);

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Subscription" />
        <EmptyState
          icon={Lock}
          title="Only the owner and managers can see this"
          description="Ask the shop owner about the subscription."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Subscription" description="Your plan, how long is left, and what you’ve paid." />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-6">
          <StatusCard sub={data} />
          {data.plans.length > 0 && (
            <Card>
              <CardHeader>
                <StepTitle n={1} title={data.currentPlan ? 'Your plan, or a different one' : 'Choose a plan'}>
                  Plans differ in how many branches you can have open.
                </StepTitle>
              </CardHeader>
              <CardContent>
                <PlanPicker
                  plans={data.plans}
                  currentId={data.currentPlan?.id ?? null}
                  activeStores={data.activeStores}
                  selectedId={plan?.id ?? null}
                  onSelect={setPickedId}
                />
              </CardContent>
            </Card>
          )}
          <PayCard sub={data} plan={plan} months={months} onMonths={setPickedMonths} />
          <PaymentsCard sub={data} />
        </div>
      )}
    </div>
  );
}

// ---- Status ----

type Look = {
  badge: string;
  tone: 'primary' | 'success' | 'warning' | 'destructive';
  icon: typeof Clock;
  headline: string;
  bar: string;
};

function look(sub: SubscriptionOverview): Look {
  const n = sub.daysLeft ?? 0;
  const days = `${n} day${n === 1 ? '' : 's'}`;
  if (!sub.hasEndDate) {
    return { badge: 'Active', tone: 'success', icon: CheckCircle2, headline: 'No end date', bar: 'bg-success' };
  }
  switch (sub.status) {
    case 'trial':
      return {
        badge: 'Free trial',
        tone: 'primary',
        icon: Sparkles,
        headline: n <= 0 ? 'Your free trial ends today' : `${days} left in your free trial`,
        bar: 'bg-primary',
      };
    case 'ending':
      return {
        badge: 'Ending soon',
        tone: 'warning',
        icon: Clock,
        headline: n <= 0 ? 'Ends today' : `${days} left`,
        bar: 'bg-warning',
      };
    case 'grace':
      return {
        badge: 'Ended',
        tone: 'destructive',
        icon: AlertTriangle,
        headline: n <= 0 ? 'The app stops working today' : `The app stops working in ${days}`,
        bar: 'bg-destructive',
      };
    default:
      return { badge: 'Active', tone: 'success', icon: CheckCircle2, headline: `${days} left`, bar: 'bg-success' };
  }
}

/** Share of the current period still to run, 0-100. In grace: of the grace days. */
function remainingPercent(sub: SubscriptionOverview): number {
  if (!sub.endsAt) return 100;
  const now = Date.now();
  const [from, to] =
    sub.status === 'grace' && sub.accessEndsAt
      ? [new Date(sub.endsAt).getTime(), new Date(sub.accessEndsAt).getTime()]
      : [new Date(sub.periodStart).getTime(), new Date(sub.endsAt).getTime()];
  const span = Math.max(to - from, DAY_MS);
  return Math.round(Math.min(Math.max((to - now) / span, 0), 1) * 100);
}

function StatusCard({ sub }: { sub: SubscriptionOverview }) {
  const l = look(sub);
  const pct = remainingPercent(sub);
  const last = sub.payments[0];

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex items-center gap-2">
          <Badge tone={l.tone}>{l.badge}</Badge>
          {sub.status === 'grace' && (
            <span className="text-xs text-muted-foreground">in the {sub.graceDays}-day grace period</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <l.icon
            className={cn(
              'h-7 w-7 shrink-0',
              l.tone === 'destructive'
                ? 'text-destructive'
                : l.tone === 'warning'
                  ? 'text-warning'
                  : l.tone === 'primary'
                    ? 'text-primary'
                    : 'text-success',
            )}
          />
          <p className="text-2xl font-semibold tracking-tight">{l.headline}</p>
        </div>
        {sub.hasEndDate && (
          <div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label="Time left in this period"
            >
              <div className={cn('h-full rounded-full transition-all', l.bar)} style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
              <span>{sub.status === 'grace' ? `Ended ${formatDate(sub.endsAt)}` : `From ${formatDate(sub.periodStart)}`}</span>
              <span>
                {sub.status === 'grace' ? `Stops ${formatDate(sub.accessEndsAt)}` : `To ${formatDate(sub.endsAt)}`}
              </span>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 border-t border-border pt-5 text-sm lg:grid-cols-4">
        <Fact
          label="Plan"
          value={sub.currentPlan?.name ?? (sub.trial ? 'Free trial' : 'No plan yet')}
          hint={
            sub.currentPlan
              ? sub.currentPlan.maxStores === null
                ? `${sub.activeStores} branch${sub.activeStores === 1 ? '' : 'es'} open · unlimited`
                : `${sub.activeStores} of ${sub.currentPlan.maxStores} branch${sub.currentPlan.maxStores === 1 ? '' : 'es'} used`
              : sub.plans.length
                ? 'Choose one below when you pay.'
                : undefined
          }
        />
        {sub.hasEndDate ? (
          <>
            <Fact
              label={sub.trial ? 'Trial ends' : sub.status === 'grace' ? 'Ended on' : 'Paid until'}
              value={formatDate(sub.endsAt)}
            />
            <Fact
              label="App stops working"
              value={formatDate(sub.accessEndsAt)}
              hint={
                sub.graceDays > 0
                  ? `${sub.graceDays} day${sub.graceDays === 1 ? '' : 's'} after the end date, if not renewed`
                  : 'On the end date, if not renewed'
              }
            />
          </>
        ) : (
          <Fact label="Ends" value="No end date" hint={sub.plans.length ? 'Paying for a plan starts one.' : 'Nothing to renew.'} />
        )}
        <Fact
          label="Last payment"
          value={last ? formatMoney(last.amount, last.currency) : 'None yet'}
          hint={last ? formatDate(last.paidAt) : sub.trial ? 'You’re on the free trial.' : undefined}
        />
      </CardContent>
    </Card>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ---- Renew ----

/** A numbered step heading: "1 Choose a plan", "2 How long, and how to pay". */
function StepTitle({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
        {n}
      </span>
      <div>
        <CardTitle className="text-base">{title}</CardTitle>
        {children && <p className="mt-0.5 text-sm text-muted-foreground">{children}</p>}
      </div>
    </div>
  );
}

/** When the paid period would end after paying for `months`: after the current end if still ahead, else from today. */
function coversUntil(sub: SubscriptionOverview, months: number) {
  const now = new Date();
  const end = sub.hasEndDate && sub.endsAt ? new Date(sub.endsAt) : null;
  const from = end && end > now ? end : now;
  const to = new Date(from);
  to.setMonth(to.getMonth() + months);
  return to;
}

/**
 * Step 2: how long, what it comes to, then the two ways to pay side by
 * side -- online (confirmed by itself) and by bank or QR ("I've paid",
 * confirmed by us). Contact details at the foot.
 */
function PayCard({
  sub,
  plan,
  months,
  onMonths,
}: {
  sub: SubscriptionOverview;
  plan: SubscriptionPlan | null;
  months: number;
  onMonths: (m: number) => void;
}) {
  const { email, phone } = sub.contact;
  // The wallets take rupees: a plan shown in dollars is paid another way.
  const inOtherCurrency = !!plan && plan.currency !== sub.online.currency;
  const hasGateways = sub.online.gateways.length > 0;
  const price = plan?.prices.find((p) => p.months === months);
  const neverPaid = sub.payments.length === 0;

  return (
    <Card>
      <CardHeader>
        <StepTitle n={sub.plans.length ? 2 : 1} title={plan ? `How long, and how to pay` : neverPaid ? 'Subscribe' : 'Renew'}>
          {plan ? `For the ${plan.name} plan.` : null}
        </StepTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {!plan ? (
          <p className="text-muted-foreground">
            There&apos;s nothing to choose yet. Get in touch below and we&apos;ll help you {neverPaid ? 'subscribe' : 'renew'}.
          </p>
        ) : (
          <>
            <LengthPicker plan={plan} months={months} onChange={onMonths} />
            {price && (
              <p className="rounded-lg bg-muted/60 px-3 py-2.5">
                You pay <span className="font-semibold text-foreground">{money(plan.currency, price.amount)}</span> for{' '}
                {lengthLabel(months)} of {plan.name}. You&apos;ll be paid up to{' '}
                <span className="font-semibold text-foreground">{formatDate(coversUntil(sub, months))}</span>.
              </p>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-lg border border-border p-4">
                <p className="flex items-center gap-2 font-medium">
                  <Zap className="h-4 w-4 text-primary" /> Pay online
                  <span className="text-xs font-normal text-muted-foreground">· instant</span>
                </p>
                {inOtherCurrency ? (
                  <p className="text-muted-foreground">
                    Your plan is priced in US dollars. eSewa, Khalti and connectIPS take Nepali rupees only, so pay by bank
                    or QR instead.
                  </p>
                ) : hasGateways ? (
                  // Remounted per plan, so a half-finished payment doesn't carry over.
                  <PayOnline key={plan.id} online={sub.online} plan={plan} months={months} />
                ) : (
                  <p className="text-muted-foreground">Not available right now. Pay by bank or QR instead.</p>
                )}
              </div>
              <div className="space-y-3 rounded-lg border border-border p-4">
                <p className="flex items-center gap-2 font-medium">
                  <Landmark className="h-4 w-4 text-primary" /> Pay by bank or QR
                  <span className="text-xs font-normal text-muted-foreground">· we confirm it</span>
                </p>
                <PayDirectly payment={sub.payment} />
                <ReportPayment sub={sub} plan={plan} months={months} />
              </div>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <span>Questions about billing?</span>
          {phone && (
            <a href={`tel:${phone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1.5 font-medium text-foreground hover:underline">
              <Phone className="h-3.5 w-3.5" /> {phone}
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 break-all font-medium text-foreground hover:underline">
              <Mail className="h-3.5 w-3.5" /> {email}
            </a>
          )}
          <Link href="/support?ask=BILLING" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
            <LifeBuoy className="h-3.5 w-3.5" /> Ask us
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentsCard({ sub }: { sub: SubscriptionOverview }) {
  const { show } = useToast();
  const [printing, setPrinting] = useState<string | null>(null);

  const print = async (id: string) => {
    setPrinting(id);
    try {
      await printSubscriptionReceipt(() => SubscriptionApi.receipt(id));
    } catch (e) {
      show(apiError(e), 'error');
    } finally {
      setPrinting(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ReceiptText className="h-5 w-5 text-primary" /> Payments
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sub.payments.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No payments yet"
            description={
              sub.trial
                ? 'You’re on the free trial. Your first payment and its receipt will show here.'
                : 'Payments recorded for your shop show here, each with its receipt.'
            }
          />
        ) : (
          <>
          {/* Phones: one card per payment; the table would run off the screen. */}
          <ul className="space-y-3 sm:hidden">
            {sub.payments.map((p) => (
              <li key={p.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {formatMoney(p.amount, p.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(p.paidAt)} · {p.method}
                      {p.planName ? ` · ${p.planName} plan` : ''}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">{p.receiptNo}</span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Covers {formatDate(p.periodFrom)} – {formatDate(p.periodTo)}
                </p>
                <Button size="sm" variant="outline" className="mt-2 w-full" loading={printing === p.id} onClick={() => print(p.id)}>
                  <Printer className="h-4 w-4" /> Receipt
                </Button>
              </li>
            ))}
          </ul>
          <div className="hidden sm:block">
          <Table>
            <THead>
              <TR>
                <TH>Receipt</TH>
                <TH>Paid on</TH>
                <TH>Covers</TH>
                <TH>Method</TH>
                <TH className="text-right">Amount</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {sub.payments.map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-xs">{p.receiptNo}</TD>
                  <TD className="whitespace-nowrap">{formatDate(p.paidAt)}</TD>
                  <TD className="whitespace-nowrap">
                    {formatDate(p.periodFrom)} – {formatDate(p.periodTo)}
                    {p.planName && <span className="block text-xs text-muted-foreground">{p.planName} plan</span>}
                  </TD>
                  <TD>
                    {p.method}
                    {p.reference && <span className="block text-xs text-muted-foreground">{p.reference}</span>}
                  </TD>
                  <TD className="whitespace-nowrap text-right font-medium">
                    {formatMoney(p.amount, p.currency)}
                  </TD>
                  <TD className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      loading={printing === p.id}
                      onClick={() => print(p.id)}
                      aria-label={`Print receipt ${p.receiptNo}`}
                    >
                      <Printer className="h-4 w-4" /> Receipt
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
