'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bell, AlertTriangle, CalendarClock } from 'lucide-react';
import { InventoryApi } from '@/api';
import { canAccessPath } from './nav';
import { useAuth } from '@/auth/AuthContext';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Low-stock (and expiring) alerts surfaced in the top bar. Polls periodically
 * so the badge updates as stock falls below each item's reorder threshold.
 */
export default function Notifications() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // Only roles that manage stock see stock alerts.
  const visible = !!user && canAccessPath(user.role, '/inventory');

  const low = useQuery({
    queryKey: ['low-stock'],
    queryFn: () => InventoryApi.lowStock(),
    enabled: visible,
    refetchInterval: 60_000,
  });
  const expiring = useQuery({
    queryKey: ['expiring'],
    queryFn: () => InventoryApi.expiring({ days: 30 }),
    enabled: visible,
    refetchInterval: 60_000,
  });

  if (!visible) return null;

  const lowItems = low.data ?? [];
  const expItems = expiring.data ?? [];
  const count = lowItems.length + expItems.length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        className="relative rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Alerts"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-80 overflow-hidden rounded-lg border border-border bg-popover shadow-lg animate-fade-in">
          <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">
            Alerts
          </div>

          <div className="max-h-96 overflow-y-auto">
            {count === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                All good — no alerts right now.
              </p>
            )}

            {lowItems.length > 0 && (
              <Section label="Low stock" icon={AlertTriangle} tone="text-warning">
                {lowItems.slice(0, 6).map((it) => {
                  const reorder = it.effectiveReorderLevel ?? it.reorderLevel;
                  return (
                    <Row
                      key={it.id}
                      title={it.product.name}
                      detail={`${it.quantity} left · reorder at ${reorder}`}
                    />
                  );
                })}
                {lowItems.length > 6 && <More n={lowItems.length - 6} />}
              </Section>
            )}

            {expItems.length > 0 && (
              <Section label="Expiring soon" icon={CalendarClock} tone="text-destructive">
                {expItems.slice(0, 5).map((b) => (
                  <Row
                    key={b.id}
                    title={b.product.name}
                    detail={`${b.quantity} · expires ${formatDate(b.expiryDate)}`}
                  />
                ))}
                {expItems.length > 5 && <More n={expItems.length - 5} />}
              </Section>
            )}
          </div>

          <Link
            href="/inventory"
            className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-accent"
          >
            View inventory
          </Link>
        </div>
      )}
    </div>
  );
}

function Section({
  label, icon: Icon, tone, children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <div className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5', tone)} /> {label}
      </div>
      {children}
    </div>
  );
}

function Row({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-4 py-1.5">
      <div className="truncate text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function More({ n }: { n: number }) {
  return <div className="px-4 py-1 text-xs text-muted-foreground">+ {n} more…</div>;
}
