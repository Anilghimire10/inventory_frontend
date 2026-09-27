'use client';
import { useRef, useState } from 'react';
import { User, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { formatDateTime, formatMoney, formatTime } from '@/lib/format';
import type { OpenShiftSummary, Store, SuggestedFloat } from '@/types';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { cn } from '@/lib/utils';

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
  suggested,
}: {
  /** `separateDrawer`: opened alongside tills already running here. */
  onOpen: (openingFloat: number, note?: string, separateDrawer?: boolean) => void;
  isPending?: boolean;
  /** Stores that may be sold from. Omitted when the user has no say. */
  stores?: Store[];
  storeId?: string | null;
  onStoreChange?: (storeId: string) => void;
  /**
   * Tills already open here that this user could work on instead of opening
   * their own. Only ever non-empty for an owner or manager: with one till
   * running the server puts them on it, so this is the case of several, or a
   * screen that hasn't caught up yet.
   */
  joinable?: OpenShiftSummary[];
  onJoin?: (shiftId: string) => void;
  /** What the last shift at this store left in the drawer, when it said. */
  suggested?: SuggestedFloat | null;
}) {
  const canJoin = !!onJoin && (joinable?.length ?? 0) > 0;
  // One drawer, one shift: with a till running here, joining it is the
  // answer, and a second drawer is the exception someone has to ask for.
  const [separate, setSeparate] = useState(false);
  const showOpen = !canJoin || separate;
  // What the last shift left is the float for *that* drawer. A second drawer
  // starts from whatever is counted into it.
  const carry = canJoin ? null : suggested;
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
  const submit = () => onOpen(value, note.trim() || undefined, canJoin || undefined);
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
                ? 'Sell into the drawer that is already open at this counter.'
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
            {separate ? (
              <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                A separate drawer gets its own count and its own Z report. Only open one
                if this counter has its own cash — sharing one drawer across two shifts
                means neither will count out.
              </p>
            ) : (
              <button
                type="button"
                className="w-full pt-1 text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => setSeparate(true)}
              >
                This counter has its own cash drawer — open a separate shift
              </button>
            )}
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
              {canJoin ? 'Open separate drawer with' : 'Open shift with'} {formatMoney(value)}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
