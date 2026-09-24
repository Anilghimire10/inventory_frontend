'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, AlertTriangle, CalendarClock, Info, Trash2 } from 'lucide-react';
import { NotificationsApi } from '@/api';
import type { AppNotification, NotificationType } from '@/types';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';

const ICONS: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  LOW_STOCK: AlertTriangle,
  EXPIRING: CalendarClock,
  GENERAL: Info,
};

const TONES: Record<NotificationType, string> = {
  LOW_STOCK: 'text-warning',
  EXPIRING: 'text-destructive',
  GENERAL: 'text-primary',
};

/**
 * Notification bell. Backed by persistent server-side notifications, so the
 * unread badge clears once seen and items can be dismissed individually.
 */
export default function Notifications() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => NotificationsApi.list(),
    refetchInterval: 60_000,
  });

  const markAllRead = useMutation({
    mutationFn: () => NotificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => NotificationsApi.dismiss(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;

  const openPanel = () => {
    setOpen((o) => {
      const next = !o;
      // Opening the panel marks everything as seen so the badge clears.
      if (next && unread > 0) markAllRead.mutate();
      return next;
    });
  };

  return (
    <div className="relative">
      <button
        onClick={openPanel}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        className="relative rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-[calc(100vw-2rem)] max-w-xs sm:w-80 overflow-hidden rounded-lg border border-border bg-popover shadow-lg animate-fade-in">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {items.length > 0 && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => markAllRead.mutate()}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                All good — no notifications right now.
              </p>
            ) : (
              items.map((n) => (
                <NotificationRow
                  key={n.id}
                  n={n}
                  onDismiss={() => dismiss.mutate(n.id)}
                  onNavigate={() => setOpen(false)}
                />
              ))
            )}
          </div>
        </div>
      )}
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
  const body = (
    <div className="flex items-start gap-2.5">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TONES[n.type])} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {!n.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
          <span className="truncate text-sm font-medium">{n.title}</span>
        </div>
        {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
        <div className="mt-0.5 text-[11px] text-muted-foreground/70">
          {formatDateTime(n.createdAt)}
        </div>
      </div>
      <Tooltip content="Dismiss" className="shrink-0">
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDismiss();
          }}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
          aria-label="Dismiss"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </div>
  );

  return (
    <div className="border-b border-border/60 px-4 py-2.5 last:border-0 hover:bg-accent/50">
      {n.link ? (
        <Link href={n.link} onClick={onNavigate} className="block">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}
