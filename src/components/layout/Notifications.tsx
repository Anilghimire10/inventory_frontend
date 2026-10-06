'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, AlertTriangle, CalendarClock, CheckCheck, Info, Trash2, X } from 'lucide-react';
import { NotificationsApi } from '@/api';
import type { AppNotification, NotificationType } from '@/types';
import { formatDateTime, formatTimeAgo } from '@/lib/format';
import { liveRefetchInterval } from '@/lib/live';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { useDismiss } from '@/hooks/useDismiss';

const ICONS: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  LOW_STOCK: AlertTriangle,
  EXPIRING: CalendarClock,
  GENERAL: Info,
};

/** The tinted disc behind each notification's icon. */
const TONES: Record<NotificationType, string> = {
  LOW_STOCK: 'bg-warning/10 text-warning',
  EXPIRING: 'bg-destructive/10 text-destructive',
  GENERAL: 'bg-primary/10 text-primary',
};

/** Keeps the bell focused, so a click inside the panel doesn't close it first. */
const keepOpen = (e: React.MouseEvent) => e.preventDefault();

/**
 * Notification bell. Backed by persistent server-side notifications, so the
 * unread badge clears once seen and items can be dismissed individually.
 * Read and dismissed are per person: opening the bell or dismissing a notice
 * only changes it for whoever is signed in, never for the rest of the shop.
 */
export default function Notifications() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => NotificationsApi.list(),
    refetchInterval: liveRefetchInterval,
  });

  // A failed click used to do nothing at all, which reads as a broken button.
  const { show } = useToast();
  const failed = (e: unknown) => show(apiError(e), 'error');
  const markAllRead = useMutation({
    mutationFn: () => NotificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    onError: failed,
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => NotificationsApi.dismiss(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    onError: failed,
  });
  const [confirmClear, setConfirmClear] = useState(false);
  const dismissAll = useMutation({
    mutationFn: () => NotificationsApi.dismissAll(),
    onSuccess: () => {
      setConfirmClear(false);
      return qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: failed,
  });

  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;

  // Announcements and support replies pop up as they arrive. Stock alerts only
  // count in the badge: a busy till would otherwise toast all day.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data) return;
    // The first load is what was already there, not news.
    if (!seen.current) {
      seen.current = new Set(data.items.map((n) => n.id));
      return;
    }
    const known = seen.current;
    const fresh = data.items.filter((n) => !known.has(n.id) && !n.readAt && n.type === 'GENERAL');
    for (const n of data.items) known.add(n.id);
    if (fresh.length === 1) show(fresh[0].title, 'info');
    else if (fresh.length > 1) show(`${fresh.length} new notifications`, 'info');
  }, [data, show]);

  // The unread count in the tab's title, so it shows from another tab too.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, '');
    document.title = unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${base}` : base;
  }, [unread]);
  const unreadShown = items.filter((n) => !n.readAt).length;

  const openPanel = () => {
    setOpen((o) => {
      const next = !o;
      // Opening the panel marks everything as seen so the badge clears.
      if (next && unread > 0) markAllRead.mutate();
      return next;
    });
  };

  const root = useDismiss<HTMLDivElement>(open, close);

  return (
    <div ref={root} className="relative">
      <button
        onClick={openPanel}
        className={cn(
          'relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
          open && 'bg-accent text-foreground',
        )}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground ring-2 ring-background">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        // Phones and small tablets: pinned under the header, full width --
        // anchored to the bell, which sits left of the account button (with
        // the name showing from 640px), it ran off the left side below ~768px.
        // Never taller than the screen, so the footer stays reachable on a
        // short or landscape phone.
        <div className="fixed inset-x-4 top-16 z-40 flex max-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-xl animate-fade-in md:absolute md:inset-x-auto md:right-0 md:top-auto md:mt-2 md:w-96">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Notifications</span>
              {unreadShown > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {unreadShown} new
                </span>
              )}
            </div>
            {unreadShown > 0 && (
              <button
                onMouseDown={keepOpen}
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="-mr-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[26rem] min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {isLoading ? (
              <LoadingRows />
            ) : isError && !data ? (
              // Not "all caught up": that would hide a low-stock alert behind
              // a network error.
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <p className="text-sm font-medium text-destructive">Couldn&rsquo;t load notifications</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="mt-2 text-xs font-medium text-primary hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Bell className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-medium">You&rsquo;re all caught up</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Low stock, expiring batches and messages from us show up here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    n={n}
                    onDismiss={() => dismiss.mutate(n.id)}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </ul>
            )}
          </div>

          {items.length > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-2">
              <span className="text-xs text-muted-foreground">
                {items.length} notification{items.length === 1 ? '' : 's'}
              </span>
              <button
                onMouseDown={keepOpen}
                onClick={() => {
                  setOpen(false);
                  setConfirmClear(true);
                }}
                className="-mr-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Clear all notifications?"
        description="They're removed from your bell only. Everyone else in the shop still sees theirs. Low-stock and expiry alerts come back if the problem clears and happens again."
        confirmLabel="Clear all"
        loading={dismissAll.isPending}
        onConfirm={() => dismissAll.mutate()}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}

function NotificationRow({
  n,
  onDismiss,
  onNavigate,
}: {
  n: AppNotification;
  onDismiss: () => void;
  onNavigate: () => void;
}) {
  const Icon = ICONS[n.type] ?? Info;
  const unread = !n.readAt;
  const content = (
    <>
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', TONES[n.type])}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        {/* Wrapped, not truncated, and line breaks kept: an announcement from
            the platform can have a 120-character title and a multi-line body,
            and the bell is the only place a shop's staff read it. */}
        <p className={cn('break-words text-sm leading-snug', unread ? 'font-semibold' : 'font-medium')}>
          {n.title}
        </p>
        {n.body && (
          <p className="mt-0.5 whitespace-pre-line break-words text-xs leading-relaxed text-muted-foreground">
            {n.body}
          </p>
        )}
        <time
          dateTime={n.createdAt}
          title={formatDateTime(n.createdAt)}
          className="mt-1 block text-[11px] text-muted-foreground/80"
        >
          {formatTimeAgo(n.createdAt)}
        </time>
      </div>
    </>
  );
  const rowClass = 'flex items-start gap-3 py-3 pl-4 pr-10';

  return (
    <li className={cn('group relative transition-colors hover:bg-accent/60', unread && 'bg-primary/[0.04]')}>
      {unread && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
      {n.link ? (
        <Link href={n.link} onClick={onNavigate} className={rowClass}>
          {content}
        </Link>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
      <Tooltip content="Dismiss" className="absolute right-2 top-2.5">
        <button
          onMouseDown={keepOpen}
          onClick={onDismiss}
          // Hidden until hover only where there is hover: a tablet is wider than
          // a phone but has no pointer to hover with, so it never showed there.
          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 group-hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </li>
  );
}

function LoadingRows() {
  return (
    <div className="divide-y divide-border/60" aria-label="Loading notifications">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex animate-pulse items-start gap-3 px-4 py-3">
          <div className="h-8 w-8 shrink-0 rounded-full bg-muted" />
          <div className="flex-1 space-y-2 py-0.5">
            <div className="h-3 w-3/4 rounded bg-muted" />
            <div className="h-2.5 w-1/2 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
