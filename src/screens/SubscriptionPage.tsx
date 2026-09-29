'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  LifeBuoy,
  Lock,
  Mail,
  Phone,
  Printer,
  ReceiptText,
  Sparkles,
} from 'lucide-react';
import { SubscriptionApi } from '@/api';
import type { SubscriptionOverview } from '@/types';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { printSubscriptionReceipt } from '@/lib/print';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';
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
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <StatusCard sub={data} />
            <RenewCard sub={data} />
          </div>
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
      <CardContent className="grid grid-cols-1 gap-4 border-t border-border pt-5 text-sm sm:grid-cols-3">
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
          <Fact label="Ends" value="No end date" hint="Nothing to renew." />
        )}
        <Fact
          label="Last payment"
          value={last ? `${last.currency} ${last.amount.toLocaleString()}` : 'None yet'}
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

function RenewCard({ sub }: { sub: SubscriptionOverview }) {
  const { email, phone } = sub.contact;
  const neverPaid = sub.payments.length === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-5 w-5 text-primary" />
          {!sub.hasEndDate ? 'Billing questions' : neverPaid ? 'How to subscribe' : 'How to renew'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          {sub.hasEndDate
            ? 'Contact us to pay. Once your payment is recorded, the new end date shows here and your receipt appears below.'
            : 'Your subscription has no end date, so there’s nothing to renew. For anything about billing, get in touch.'}
        </p>
        {(email || phone) && (
          <div className="space-y-2">
            {phone && (
              <a href={`tel:${phone.replace(/\s+/g, '')}`} className="flex items-center gap-2 font-medium hover:underline">
                <Phone className="h-4 w-4 text-muted-foreground" /> {phone}
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="flex items-center gap-2 break-all font-medium hover:underline">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" /> {email}
              </a>
            )}
          </div>
        )}
        <Link
          href="/support?ask=BILLING"
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent"
        >
          <LifeBuoy className="h-4 w-4" /> Ask about billing
        </Link>
      </CardContent>
    </Card>
  );
}

// ---- Payments ----

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
                  </TD>
                  <TD>
                    {p.method}
                    {p.reference && <span className="block text-xs text-muted-foreground">{p.reference}</span>}
                  </TD>
                  <TD className="whitespace-nowrap text-right font-medium">
                    {p.currency} {p.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
        )}
      </CardContent>
    </Card>
  );
}
