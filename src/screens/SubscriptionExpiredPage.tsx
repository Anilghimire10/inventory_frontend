'use client';
import { useMemo, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarX, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { blockSnapshot, parseBlock } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { AuthShell } from './LoginPage';

/**
 * Where a shop lands when its subscription stops it -- at sign-in, or mid-
 * session once the grace period runs out. Before this it was bounced to the
 * login form with a one-line error, which it could not get past and which
 * said nothing about how to fix it.
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

  const expired = block?.reason === 'expired';
  const { email, phone } = block?.contact ?? {};

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

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-medium">To renew</p>
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
        <p className="mt-3 text-xs text-muted-foreground">
          Not the owner? Ask your shop owner to renew.
        </p>
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
