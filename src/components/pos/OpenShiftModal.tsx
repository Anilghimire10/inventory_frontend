'use client';
import { useRef, useState } from 'react';
import { Plus, User, Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { formatDateTime, formatMoney, formatTime } from '@/lib/format';
import type { OpenShiftSummary, Store, SuggestedFloat } from '@/types';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { tillName } from '@/lib/tills';

/**
 * Asks for a starting float before the first sale.
 *
 * It can be put aside: someone looking up a price or a stock level shouldn't
 * have to count a drawer to do it. Checkout stays locked without a shift
 * either way, so dismissing it only defers the count, and the POS keeps a way
 * back to it on screen.
 *
 * It also carries the store picker for anyone allowed to choose one. This
 * modal covers the whole till, so a picker anywhere else on the page cannot be
 * reached before a shift exists -- and once one does, the shift pins the store
 * anyway. Opening the drawer and naming the store it belongs to is one
 * decision, so it is one dialog.
 *
 * For an owner or manager with tills already open here, it is a choice: work
 * on one of them -- a cashier's, or another owner's or manager's -- or open
 * their own. `ownOnly` is the second half on its own, for an owner already on
 * someone's till who asks for their own from the POS header.
 */
export function OpenShiftModal({
  onOpen,
  isPending,
  stores,
  storeId,
  onStoreChange,
  joinable,
  onJoin,
  ownOnly = false,
  suggested,
  onDismiss,
}: {
  /** `separateDrawer`: their own till, opened alongside others running here. */
  onOpen: (openingFloat: number, note?: string, separateDrawer?: boolean) => void;
  isPending?: boolean;
  /** Stores that may be sold from. Omitted when the user has no say. */
  stores?: Store[];
  storeId?: string | null;
  onStoreChange?: (storeId: string) => void;
  /**
   * Tills already open here that this user could work on instead of opening
   * their own -- anyone's: a cashier's, another owner's or a manager's. Only
   * ever non-empty for an owner or manager who has not chosen a till yet.
   */
  joinable?: OpenShiftSummary[];
  onJoin?: (shiftId: string) => void;
  /** Open the caller's own till alongside the ones running here; no list. */
  ownOnly?: boolean;
  /** What the last shift at this store left in the drawer, when it said. */
  suggested?: SuggestedFloat | null;
  /** Put the dialog aside without opening a shift (X button and Escape). */
  onDismiss: () => void;
}) {
  const canJoin = !ownOnly && !!onJoin && (joinable?.length ?? 0) > 0;
  // Their own till sits alongside others running here: say so to the server,
  // which otherwise refuses a second drawer opened by habit.
  const alongside = canJoin || ownOnly;
  // With tills running, nothing is opened until they choose their own.
  const [ownChosen, setOwnChosen] = useState(false);
  const showOpen = !canJoin || ownChosen;
  // What the last shift left is the float for *that* drawer, still in use. A
  // till of their own starts from whatever is counted into it.
  const carry = alongside ? null : suggested;
  // Null until the cashier types: until then the field shows what the last
  // shift left, which usually arrives a moment after this dialog does.
  const [typed, setTyped] = useState<string | null>(null);
  const float = typed ?? (carry ? String(carry.amount) : '');
  const [note, setNote] = useState('');
  const value = Math.max(0, Number(float) || 0);
  const carriedDiff =
    carry && float.trim() !== ''
      ? Math.round((value - carry.amount) * 100) / 100
      : 0;
  const submit = () => onOpen(value, note.trim() || undefined, alongside || undefined);
  // Only the multi-store case shows the picker, and only then can the store be
  // missing -- a single-store till always knows where it is.
  const picksStore = !!onStoreChange && (stores?.length ?? 0) > 1;
  const panelRef = useRef<HTMLDivElement>(null);
  // Not while the till is being opened: the X is disabled then too, and a
  // dialog gone before the shift lands left nothing to say it had.
  useFocusTrap(panelRef, true, isPending ? undefined : onDismiss);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-shift-title"
        className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-lg"
      >
        <Tooltip content="Close" className="absolute right-4 top-4">
          <button
            type="button"
            onClick={onDismiss}
            disabled={isPending}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </Tooltip>
        <div className="mb-4 flex items-center gap-3 pr-8">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <h2 id="open-shift-title" className="text-base font-semibold text-foreground">
              {ownOnly ? 'Open your own till' : canJoin ? 'Which till will you work on?' : 'Open your shift'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {ownOnly
                ? 'Count the cash you start with. The other tills stay open.'
                : canJoin
                  ? 'Work on a till that is already open here, or open your own.'
                  : 'Count the drawer before your first sale.'}
            </p>
          </div>
        </div>

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

        {/* Working on a till puts your sales in that drawer, so each names
            whose it is and how it is doing -- enough to recognise the one you
            are standing at without walking over to read the screen. */}
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
                    {tillName(sh)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Opened {formatTime(sh.openedAt)} · {sh.salesCount} sale
                    {sh.salesCount === 1 ? '' : 's'} · float {formatMoney(sh.openingFloat)}
                  </span>
                </span>
              </button>
            ))}
            <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <button
              type="button"
              disabled={isPending}
              aria-pressed={ownChosen}
              onClick={() => setOwnChosen(true)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-muted/50 disabled:opacity-50',
                ownChosen ? 'border-primary bg-muted/50' : 'border-border',
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Plus className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">Open my own till</span>
                <span className="block text-xs text-muted-foreground">
                  Its own cash count and its own Z report
                </span>
              </span>
            </button>
          </div>
        )}

        {showOpen && (
          <>
            <Field label="Opening float">
              <Input
                type="number"
                step="0.01"
                min="0"
                autoFocus
                disabled={isPending}
                value={float}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                }}
                placeholder="0.00"
              />
            </Field>
            {/* The count is checked against what was left, so a gap overnight is
                caught at the start of the day instead of hiding inside the next
                Z report and landing on whoever closes it. */}
            {carry && (
              <p
                className={cn(
                  'mt-1.5 text-xs',
                  carriedDiff === 0 ? 'text-muted-foreground' : 'text-warning',
                )}
              >
                {carriedDiff === 0
                  ? `${carry.closedBy} left ${formatMoney(carry.amount)} in the drawer (${formatDateTime(carry.closedAt)}).`
                  : `${formatMoney(Math.abs(carriedDiff))} ${carriedDiff < 0 ? 'less' : 'more'} than the ${formatMoney(carry.amount)} ${carry.closedBy} left. Count again, or say why in the note.`}
              </p>
            )}
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
              onClick={submit}
            >
              {alongside ? 'Open my till with' : 'Open shift with'} {formatMoney(value)}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
