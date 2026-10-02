'use client';
import { useEffect, useState } from 'react';
import { Wrench } from 'lucide-react';
import { StatusApi } from '@/api';
import { MAINTENANCE_EVENT } from '@/lib/api';

/** The admin panel promises shops see a change within a minute. */
const POLL_MS = 60_000;

type Status = { message: string | null; closed: boolean };

/**
 * The maintenance banner and maintenance mode, both set on the admin panel's
 * Announcements page. The banner shows on every page, signed in or not, and
 * can't be dismissed. Maintenance mode covers the page with a "down for
 * maintenance" screen -- the API refuses shop requests meanwhile -- and
 * lifts by itself when the admin turns it off. Public pages don't mount
 * React Query, so this fetches by itself.
 *
 * `openDuringMaintenance`: the payment-return page, whose check the API
 * keeps open, shows the banner only.
 */
export function MaintenanceBanner({ boxed = false, openDuringMaintenance = false }: { boxed?: boolean; openDuringMaintenance?: boolean }) {
  const [status, setStatus] = useState<Status>({ message: null, closed: false });
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      setChecking(true);
      StatusApi.get()
        .then((s) => alive && setStatus({ message: s.maintenanceMessage?.trim() || null, closed: !!s.maintenanceMode }))
        // Unreachable: keep what we had. A notice about downtime shouldn't vanish because of it.
        .catch(() => {})
        .finally(() => alive && setChecking(false));
    };
    const onVisible = () => document.visibilityState === 'visible' && load();
    load();
    const timer = setInterval(load, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(MAINTENANCE_EVENT, load);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(MAINTENANCE_EVENT, load);
    };
  }, []);

  if (status.closed && !openDuringMaintenance) {
    return (
      <div role="alertdialog" aria-modal="true" aria-labelledby="maintenance-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/15">
            <Wrench className="h-6 w-6 text-warning" aria-hidden />
          </div>
          <h1 id="maintenance-title" className="mt-4 text-xl font-semibold tracking-tight">
            Down for maintenance
          </h1>
          <p className="mt-2 whitespace-pre-line break-words text-sm text-muted-foreground">
            {status.message || 'We’re updating the app. It will be back shortly.'}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Nothing you&apos;ve saved is lost. This page opens again by itself when we&apos;re done.
          </p>
          <button
            type="button"
            disabled={checking}
            onClick={() => window.dispatchEvent(new Event(MAINTENANCE_EVENT))}
            className="mt-4 inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent disabled:opacity-60"
          >
            {checking ? 'Checking…' : 'Check again'}
          </button>
        </div>
      </div>
    );
  }

  if (!status.message) return null;

  return (
    <div
      role="status"
      className={
        boxed
          ? 'mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/15 px-3 py-2 text-sm text-foreground'
          : 'flex items-start gap-3 border-b border-warning/40 bg-warning/15 px-4 py-2 text-sm text-foreground lg:px-6'
      }
    >
      <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
      <p className="min-w-0 flex-1 whitespace-pre-line break-words">{status.message}</p>
    </div>
  );
}
