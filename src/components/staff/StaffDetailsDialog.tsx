'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Mail, Store as StoreIcon } from 'lucide-react';
import { AuditApi, UsersApi } from '@/api';
import type { AppUser } from '@/types';
import { useStores } from '@/hooks/useStores';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { ErrorState, LoadingBlock } from '@/components/ui/misc';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { actionTone } from '@/lib/audit';
import { formatDate, formatDateTime, formatTimeAgo } from '@/lib/format';

/** How much of their activity the dialog shows; the rest is on Activity Log. */
const RECENT = 10;

/**
 * One staff member: role, store, when they joined and last signed in, and
 * what they have done lately (from the activity log). Opened by clicking a
 * row on Staff, or a person in an activity entry.
 */
export function StaffDetailsDialog({
  userId,
  onClose,
  onBack,
  actions,
}: {
  userId: string;
  onClose: () => void;
  /** Back to where it was opened from, when that was a dialog too. */
  onBack?: () => void;
  /** Footer buttons, given the loaded person (Edit, Deactivate, Delete…). */
  actions?: (u: AppUser) => React.ReactNode;
}) {
  const person = useQuery({ queryKey: ['users', userId], queryFn: () => UsersApi.get(userId) });
  const activity = useQuery({
    queryKey: ['audit', 'user', userId],
    queryFn: () => AuditApi.list({ userId, page: 1, limit: RECENT }),
  });
  const lastLogin = useQuery({
    queryKey: ['audit', 'user', userId, 'login'],
    queryFn: () => AuditApi.list({ userId, action: 'auth.login', page: 1, limit: 1 }),
  });
  const { data: stores } = useStores();

  const u = person.data;
  const store = u?.storeId ? stores?.find((s) => s.id === u.storeId) : null;
  const signedIn = lastLogin.data?.data[0]?.createdAt;

  return (
    <Dialog open onClose={onClose} title={u?.name ?? 'Staff'} className="max-w-2xl">
      {person.isError ? (
        <ErrorState onRetry={() => person.refetch()} />
      ) : !u ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{u.role}</Badge>
            {u.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="muted">Inactive</Badge>}
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-md border border-border p-4 text-sm sm:grid-cols-2">
            <div className="flex min-w-0 items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <a href={`mailto:${u.email}`} className="truncate hover:underline">{u.email}</a>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <StoreIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{store ? store.name : 'Any store'}</span>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Joined</dt>
              <dd>{formatDate(u.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Last signed in</dt>
              <dd title={signedIn ? formatDateTime(signedIn) : undefined}>
                {lastLogin.isLoading ? '…' : lastLogin.isError ? '—' : signedIn ? formatTimeAgo(signedIn) : 'Not yet'}
              </dd>
            </div>
          </dl>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent activity</h3>
            {activity.isError ? (
              <p className="text-sm text-destructive">
                Couldn&rsquo;t load their activity.{' '}
                <button type="button" className="font-medium underline" onClick={() => activity.refetch()}>
                  Retry
                </button>
              </p>
            ) : activity.isLoading ? (
              <LoadingBlock />
            ) : !activity.data?.data.length ? (
              <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>When</TH>
                    <TH>Action</TH>
                    <TH className="hidden sm:table-cell">Details</TH>
                  </TR>
                </THead>
                <TBody>
                  {activity.data.data.map((e) => (
                    <TR key={e.id}>
                      <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(e.createdAt)}</TD>
                      <TD><Badge tone={actionTone(e.action)}>{e.action}</Badge></TD>
                      <TD className="hidden text-muted-foreground sm:table-cell">{e.summary || '—'}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </section>
        </div>
      )}
      <DialogFooter>
        {onBack && (
          <Button type="button" variant="ghost" className="mr-auto" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        )}
        {u && actions?.(u)}
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
