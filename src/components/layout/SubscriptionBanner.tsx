'use client';
import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { SubscriptionInfo } from '@/types';

const DISMISS_KEY = 'inv_sub_banner_dismissed';

// sessionStorage as an external store, the same way ShiftContext reads the
// joined till: no setState in an effect, and a null server snapshot.
const dismissListeners = new Set<() => void>();
function subscribeDismissed(onChange: () => void) {
  dismissListeners.add(onChange);
  return () => {
    dismissListeners.delete(onChange);
  };
}
function readDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}
function dismiss(key: string) {
  try {
    sessionStorage.setItem(DISMISS_KEY, key);
  } catch {
    // Storage unavailable: the banner stays up, which is the safe failure.
  }
  dismissListeners.forEach((l) => l());
}

const days = (n: number) => (n <= 0 ? 'today' : n === 1 ? 'in 1 day' : `in ${n} days`);

function message(sub: SubscriptionInfo & { daysLeft: number }) {
  switch (sub.status) {
    case 'trial':
      return sub.daysLeft <= 0
        ? 'Your free trial ends today.'
        : `Free trial: ${sub.daysLeft} day${sub.daysLeft === 1 ? '' : 's'} left.`;
    case 'ending':
      return `Your subscription ends ${days(sub.daysLeft)}, on ${formatDate(sub.endsAt)}.`;
    case 'grace':
      return `Your subscription ended on ${formatDate(sub.endsAt)}. The app stops working ${days(
        sub.daysLeft,
      )} unless it's renewed.`;
    default:
      return null;
  }
}

/**
 * The subscription, for the people who can renew it (the API only sends it
 * to owners and managers). A shop should hear its trial is ending from the
 * app, days ahead -- not find out when the till locks.
 *
 * Trial and "ending soon" can be dismissed for the rest of the tab's
 * session. The grace period can't: by then the app is days from stopping.
 */
export function SubscriptionBanner() {
  const { user } = useAuth();
  const sub = user?.subscription;
  const key = sub ? `${sub.status}:${sub.endsAt}` : '';
  const dismissed = useSyncExternalStore(subscribeDismissed, readDismissed, () => null);

  if (!sub || sub.status === 'active' || sub.daysLeft == null) return null;
  const grace = sub.status === 'grace';
  if (!grace && dismissed === key) return null;
  const text = message({ ...sub, daysLeft: sub.daysLeft });
  if (!text) return null;

  const { email, phone } = sub.contact ?? {};
  const Icon = grace ? AlertTriangle : sub.status === 'trial' ? Sparkles : Clock;

  return (
    <div
      role={grace ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 border-b px-4 py-2.5 text-sm lg:px-6',
        grace
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : sub.status === 'ending'
            ? 'border-warning/30 bg-warning/10 text-foreground'
            : 'border-primary/20 bg-primary/5 text-foreground',
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', !grace && (sub.status === 'ending' ? 'text-warning' : 'text-primary'))} />
      <p className="min-w-0 flex-1">
        <span className="font-medium">{text}</span>{' '}
        <span className={grace ? '' : 'text-muted-foreground'}>
          {email || phone ? (
            <>
              {sub.status === 'trial' ? 'To subscribe, contact ' : 'To renew, contact '}
              {email && (
                <a href={`mailto:${email}`} className="underline underline-offset-2">
                  {email}
                </a>
              )}
              {email && phone && ' · '}
              {phone && (
                <a href={`tel:${phone.replace(/\s+/g, '')}`} className="underline underline-offset-2">
                  {phone}
                </a>
              )}
              .
            </>
          ) : sub.status === 'trial' ? (
            'Contact us to subscribe.'
          ) : (
            'Contact us to renew.'
          )}
        </span>{' '}
        <Link href="/subscription" className="whitespace-nowrap font-medium underline underline-offset-2">
          View subscription
        </Link>
      </p>
      {!grace && (
        <button
          type="button"
          onClick={() => dismiss(key)}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
