'use client';
import { useRef, useState } from 'react';
import { User, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { formatMoney, formatTime } from '@/lib/format';
import type { OpenShiftSummary, Store } from '@/types';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/**
 * Blocks POS checkout until the cashier counts a starting float.
 *
 * It also carries the store picker for anyone allowed to choose one. This
 * modal covers the whole till, so a picker anywhere else on the page cannot be
 * reached before a shift exists -- and once one does, the shift pins the store
 * anyway. Opening the drawer and naming the store it belongs to is one
 * decision, so it is one dialog.
 */
export function OpenShiftModal({
  onOpen,
  isPending,
  stores,
  storeId,
  onStoreChange,
  joinable,
  onJoin,
}: {
  onOpen: (openingFloat: number, note?: string) => void;
  isPending?: boolean;
  /** Stores that may be sold from. Omitted when the user has no say. */
  stores?: Store[];
  storeId?: string | null;
  onStoreChange?: (storeId: string) => void;
  /**
   * Tills already open here that this user could work on instead of opening
   * their own. Only ever non-empty for an owner or manager, and only when the
   * server found more than one and would not guess between them.
   */
  joinable?: OpenShiftSummary[];
  onJoin?: (shiftId: string) => void;
}) {
  const canJoin = !!onJoin && (joinable?.length ?? 0) > 0;
  const [float, setFloat] = useState('');
  const [note, setNote] = useState('');
  const value = Math.max(0, Number(float) || 0);
  // Only the multi-store case shows the picker, and only then can the store be
  // missing -- a single-store till always knows where it is.
  const picksStore = !!onStoreChange && (stores?.length ?? 0) > 1;
  const panelRef = useRef<HTMLDivElement>(null);
  // No onEscape: this modal blocks checkout until a shift is opened, so
  // Escape must not offer a way out.
  useFocusTrap(panelRef, true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-shift-title"
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-lg"
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <h2 id="open-shift-title" className="text-base font-semibold text-foreground">
              {canJoin ? 'Which till are you on?' : 'Open your shift'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {canJoin
                ? 'Join a drawer that is already open, or count your own.'
                : 'Count the drawer before your first sale.'}
            </p>
          </div>
        </div>

        {/* Joining puts your sales in someone else's drawer, so it names whose
            and how the till is doing -- enough to recognise the one you are
            standing at without walking over to read the screen. */}
        {canJoin && (
          <div className="mb-4 space-y-2">
            {joinable!.map((sh) => (
              <button
                key={sh.id}
                type="button"
                disabled={isPending}
                onClick={() => onJoin!(sh.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary hover:bg-muted/50 disabled:opacity-50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {sh.openedBy.name}&apos;s till
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Opened {formatTime(sh.openedAt)} · {sh.salesCount} sale
                    {sh.salesCount === 1 ? '' : 's'} · float {formatMoney(sh.openingFloat)}
                  </span>
                </span>
              </button>
            ))}
            <div className="flex items-center gap-3 pt-1">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or open your own</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}

        {picksStore && (
          <Field label="Store" className="mb-3">
            <Select
              aria-label="Store to sell from"
              disabled={isPending}
              value={storeId ?? ''}
              onChange={(e) => onStoreChange(e.target.value)}
            >
              {(stores ?? []).map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Opening float">
          <Input
            type="number"
            step="0.01"
            min="0"
            autoFocus
            disabled={isPending}
            value={float}
            onChange={(e) => setFloat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onOpen(value, note.trim() || undefined);
            }}
            placeholder="0.00"
          />
        </Field>
        <Field label="Note (optional)" className="mt-3">
          <Input
            disabled={isPending}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. till 2"
          />
        </Field>

        <Button
          className="mt-5 h-11 w-full"
          loading={isPending}
          disabled={picksStore && !storeId}
          onClick={() => onOpen(value, note.trim() || undefined)}
        >
          Open shift with {formatMoney(value)}
        </Button>
      </div>
    </div>
  );
}
