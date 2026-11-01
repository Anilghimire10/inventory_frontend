'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShiftsApi, type CloseShiftBody } from '@/api';
import type { ShiftReport } from '@/types';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/components/ui/toast';
import { apiError } from '@/lib/api';
import { isStaleShift } from '@/lib/cash';
import { printShiftReport } from '@/lib/print';
import { CloseShiftModal } from '@/components/pos/CloseShiftModal';
import { LoadingBlock, ErrorState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/tooltip';
import { formatMoney, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Cash-drawer sessions, for the whole business or one store — owner/manager only. */
export function ShiftHistory({
  storeId,
  storeLabel,
}: {
  storeId?: string;
  storeLabel: string | null;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { show } = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['shift-history', storeId],
    queryFn: () => ShiftsApi.list({ limit: 20, storeId }),
  });
  const history = data?.data ?? [];

  // Closing a till from here: the one a cashier forgot, found the next
  // morning. It still has to be counted -- the drawer is at the counter, and
  // this is the same count the POS asks for.
  const [closing, setClosing] = useState<ShiftReport | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const startClose = async (id: string) => {
    setLoadingId(id);
    try {
      const report = await ShiftsApi.report(id);
      if (report.isOpen) setClosing(report);
      else {
        show('That shift was already closed.', 'info');
        void refetch();
      }
    } catch (e) {
      show(apiError(e), 'error');
    } finally {
      setLoadingId(null);
    }
  };
  const closeMutation = useMutation({
    mutationFn: ({ id, ...body }: CloseShiftBody & { id: string }) => ShiftsApi.close(id, body),
    onSuccess: (closed) => {
      setClosing(null);
      qc.invalidateQueries({ queryKey: ['shift-history'] });
      // The POS on this device may be showing that till as open.
      qc.invalidateQueries({ queryKey: ['shift-current'] });
      qc.invalidateQueries({ queryKey: ['shift-open'] });
      qc.invalidateQueries({ queryKey: ['shift-float'] });
      printShiftReport(closed, {
        businessName: user?.business?.name ?? 'Shift report',
        currency: user?.business?.currency ?? 'USD',
      });
      show(closed.user?.name ? `Closed ${closed.user.name}’s shift` : 'Shift closed');
    },
    onError: (e) => show(apiError(e), 'error'),
  });
  return (
    <>
      <div className="border-b border-border p-5">
        <h2 className="font-semibold">Shift History</h2>
        <p className="text-xs text-muted-foreground">
          Cash-drawer sessions {storeLabel && storeLabel !== 'all stores'
            ? `at ${storeLabel}`
            : 'across the business'}, most recent first.
        </p>
      </div>
      {isError ? (
        <div className="p-5">
          <ErrorState onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <div className="p-5">
          <LoadingBlock />
        </div>
      ) : history.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {storeId ? 'No shifts at this store yet.' : 'No shifts closed yet.'}
        </p>
      ) : (
        // `relative` keeps the absolutely-positioned sr-only header inside
        // this scroller; without it the page scrolls sideways on phones.
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Cashier</th>
                <th className="px-5 py-3 font-medium">Store</th>
                <th className="px-5 py-3 font-medium">Opened</th>
                <th className="px-5 py-3 font-medium">Closed</th>
                <th className="px-5 py-3 text-right font-medium">Sales</th>
                <th className="px-5 py-3 text-right font-medium"><Hint tip="What should be in the drawer: opening float + cash sales + credit collected in cash − cash refunds.">Expected</Hint></th>
                <th className="px-5 py-3 text-right font-medium">Counted</th>
                <th className="px-5 py-3 text-right font-medium"><Hint tip="Counted cash minus expected. Negative means the drawer is short.">Variance</Hint></th>
                <th className="px-5 py-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {history.map((s) => {
                const variance = s.variance == null ? null : Number(s.variance);
                return (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 font-medium">{s.user?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {s.store?.name ?? '—'}
                      {s.counter && <span className="block text-xs">{s.counter.name}</span>}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{formatDateTime(s.openedAt)}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {s.closedAt ? (
                        formatDateTime(s.closedAt)
                      ) : (
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            isStaleShift(s.openedAt)
                              ? 'bg-warning/15 text-warning'
                              : 'bg-success/15 text-success',
                          )}
                          title={
                            isStaleShift(s.openedAt)
                              ? 'Open for over a day. Its count will mix days of cash together.'
                              : undefined
                          }
                        >
                          {isStaleShift(s.openedAt) ? 'Still open' : 'Open'}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">{s._count?.sales ?? 0}</td>
                    {/* Nothing is expected or counted until the drawer is
                        closed; formatMoney would print a null as 0.00, which
                        reads as an empty till rather than an open one. */}
                    <td className="px-5 py-3 text-right">
                      {s.expectedCash == null ? '—' : formatMoney(s.expectedCash)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {s.countedCash == null ? '—' : formatMoney(s.countedCash)}
                    </td>
                    <td
                      className={cn(
                        'px-5 py-3 text-right font-medium',
                        variance == null || variance === 0
                          ? 'text-muted-foreground'
                          : variance > 0
                            ? 'text-success'
                            : 'text-destructive',
                      )}
                    >
                      {variance == null ? '—' : variance === 0 ? '—' : `${variance > 0 ? '+' : ''}${formatMoney(variance)}`}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {!s.closedAt && (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={loadingId === s.id}
                          onClick={() => startClose(s.id)}
                        >
                          Close
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {closing && (
        <CloseShiftModal
          shift={closing}
          currency={user?.business?.currency}
          onClose={() => setClosing(null)}
          onConfirm={(body) => closeMutation.mutate({ id: closing.id, ...body })}
          isPending={closeMutation.isPending}
        />
      )}
    </>
  );
}
