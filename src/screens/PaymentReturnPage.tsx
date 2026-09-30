'use client';
import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { SubscriptionApi } from '@/api';
import { apiError, blockSnapshot, getToken } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { returnedPayment } from '@/lib/payment-return';
import { LoadingBlock } from '@/components/ui/misc';
import { AuthShell } from './LoginPage';

/**
 * Where eSewa, Khalti and connectIPS send the owner back to. What they bring in the URL
 * only tells us which payment it was: whether it's paid comes from the API,
 * which asks the gateway itself. It needs no session -- a locked shop's owner
 * has none -- and says where to go next either way.
 */
const noSubscribe = () => () => {};
const isNotFound = (e: unknown) => axios.isAxiosError(e) && e.response?.status === 404;
const search = () => window.location.search;
/** A few checks a few seconds apart; after that the API's job takes over. */
const POLLS = 8;
const POLL_MS = 3000;

export default function PaymentReturnPage() {
  const query = useSyncExternalStore(noSubscribe, search, () => null);
  const signedIn = useSyncExternalStore(noSubscribe, () => !!getToken(), () => false);
  const locked = useSyncExternalStore(noSubscribe, () => !!blockSnapshot(), () => false);
  const { id, cancelled } = query === null ? { id: null, cancelled: false } : returnedPayment(query);
  const [polls, setPolls] = useState(0);

  const check = useQuery({
    queryKey: ['online-payment', id],
    queryFn: async () => {
      setPolls((n) => n + 1);
      return SubscriptionApi.checkOnline(id!);
    },
    enabled: !!id,
    retry: 1,
    // Still with the gateway: look again, unless the owner cancelled.
    refetchInterval: (q) => (q.state.data?.status === 'STARTED' && !cancelled && polls < POLLS ? POLL_MS : false),
  });

  const back = signedIn
    ? { href: '/subscription', label: 'Back to Subscription' }
    : locked
      ? { href: '/subscription-expired', label: 'Back' }
      : { href: '/login', label: 'Sign in' };
  const d = check.data;
  const gateway = { ESEWA: 'eSewa', KHALTI: 'Khalti', CONNECTIPS: 'connectIPS' }[d?.gateway ?? 'ESEWA'];
  const what = d ? `${d.currency} ${d.amount.toLocaleString('en-IN')} for ${d.months} month${d.months === 1 ? '' : 's'}` : '';

  let body: React.ReactNode;
  if (query === null || (check.isLoading && !!id)) {
    body = <LoadingBlock label="Checking your payment…" />;
  } else if (!id || check.isError) {
    body = (
      <Result tone="destructive" icon={XCircle} title="We couldn't find this payment">
        {check.isError && !isNotFound(check.error)
          ? `${apiError(check.error).replace(/\.?$/, '.')} Try reloading this page in a moment.`
          : 'This link doesn’t match a payment started from the app.'}{' '}
        If money was taken, contact us with the transaction ID from your eSewa, Khalti or bank app.
      </Result>
    );
  } else if (d?.status === 'COMPLETED') {
    body = (
      <Result tone="success" icon={CheckCircle2} title="Payment received — thank you">
        {what} by {gateway}.{' '}
        {d.paidUntil ? `Your subscription now runs to ${formatDate(d.paidUntil)}.` : 'Your subscription is extended.'}{' '}
        The receipt is on the Subscription page and in your email.
        {!signedIn && ' Sign in to carry on.'}
      </Result>
    );
  } else if (d?.status === 'FAILED' || cancelled) {
    body = (
      <Result tone="destructive" icon={XCircle} title="Payment not completed">
        {d?.failReason && d.status === 'FAILED' ? `${d.failReason}. ` : 'The payment was cancelled or didn’t go through. '}
        Nothing was added to your subscription. You can try again, or pay another way.
      </Result>
    );
  } else {
    body = (
      <Result tone="warning" icon={Clock} title={`Waiting for ${gateway} to confirm`}>
        {polls < POLLS
          ? `Checking ${what} with ${gateway}…`
          : `${gateway} hasn't confirmed ${what} yet. That can take a few minutes. Your subscription is extended by itself as soon as it does — you can close this page.`}
      </Result>
    );
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold tracking-tight">Subscription payment</h1>
      <div className="mt-6">{body}</div>
      <Link
        href={d?.status === 'COMPLETED' && !signedIn ? '/login' : back.href}
        className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {d?.status === 'COMPLETED' && !signedIn ? 'Sign in' : back.label}
      </Link>
    </AuthShell>
  );
}

function Result({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: 'success' | 'warning' | 'destructive';
  icon: typeof CheckCircle2;
  title: string;
  children: React.ReactNode;
}) {
  const look = {
    success: 'border-success/40 bg-success/10 text-success',
    warning: 'border-warning/40 bg-warning/10 text-warning',
    destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
  }[tone];
  return (
    <div className={`rounded-lg border p-4 ${look}`}>
      <p className="flex items-center gap-2 font-medium">
        <Icon className="h-5 w-5 shrink-0" /> {title}
      </p>
      <p className="mt-2 text-sm text-foreground">{children}</p>
    </div>
  );
}
