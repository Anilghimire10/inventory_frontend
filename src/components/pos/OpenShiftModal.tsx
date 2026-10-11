'use client';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, User, Wallet, X } from 'lucide-react';
import { ShiftsApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { formatDateTime, formatMoney, formatTime } from '@/lib/format';
import type { Counter, OpenShiftSummary, Store } from '@/types';
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
 * Every shift is a counter's drawer. A cashier opens the counter they are
 * assigned to (`myCounter`). An owner or manager chooses: work on a till
 * already open here -- a cashier's, or another owner's or manager's -- or open
 * a free counter. `ownOnly` is the second half on its own, for an owner already
 * on someone's till who asks for a counter of their own from the POS header.
 */
export function OpenShiftModal({
  onOpen,
  isPending,
  stores,
  storeId,
  onStoreChange,
  joinable,
  onJoin,
  freeCounters = [],
  myCounter,
  noCounter = false,
  ownOnly = false,
  onDismiss,
}: {
  /** `counterId`: the counter an owner or manager chose to open. */
  onOpen: (openingFloat: number, note?: string, counterId?: string) => void;
  isPending?: boolean;
  /** Stores that may be sold from. Omitted when the user has no say. */
  stores?: Store[];
  storeId?: string | null;
  onStoreChange?: (storeId: string) => void;
  /**
   * Tills already open here that this user could work on instead of opening
   * a counter -- anyone's: a cashier's, another owner's or a manager's. Only
   * ever non-empty for an owner or manager who has not chosen a till yet.
   */
  joinable?: OpenShiftSummary[];
  onJoin?: (shiftId: string) => void;
  /** Counters here with no shift open: an owner or manager may open one. */
  freeCounters?: Counter[];
  /** A cashier's own counter, named so they see which drawer they count. */
  myCounter?: { id: string; name: string } | null;
  /** A cashier with no counter: there is nothing they can open. */
  noCounter?: boolean;
  /** Open a counter alongside the tills running here; no list of those. */
  ownOnly?: boolean;
  /** Put the dialog aside without opening a shift (X button and Escape). */
  onDismiss: () => void;
}) {
  const tills = ownOnly ? [] : (joinable ?? []);
  const canJoin = !!onJoin && tills.length > 0;
  // A choice to make: a till to work on, or more than one counter to open.
  const choosing = canJoin || freeCounters.length > 1;
  const [picked, setPicked] = useState<string | null>(null);
  // The counter being opened: the one picked, or the only one there is.
  const counter =
    freeCounters.find((c) => c.id === picked) ?? (!choosing && freeCounters.length === 1 ? freeCounters[0] : null);
  const showOpen = !choosing || !!counter;
  // What the last shift on this counter left in its drawer, when it said:
  // the float to count in against. A cashier's counter is their own.
  const { data: carry } = useQuery({
    queryKey: ['shift-float', storeId, counter?.id ?? myCounter?.id ?? 'store'],
    queryFn: () => ShiftsApi.suggestedFloat(storeId!, counter?.id),
    enabled: !!storeId && showOpen,
    staleTime: 15_000,
  });
  // Null until they type: until then the field shows what the last shift
  // left, which usually arrives a moment after this dialog does.
  const [typed, setTyped] = useState<string | null>(null);
  const float = typed ?? (carry ? String(carry.amount) : '');
  const [note, setNote] = useState('');
  const value = Math.max(0, Number(float) || 0);
  const carriedDiff =
    carry && float.trim() !== ''
      ? Math.round((value - carry.amount) * 100) / 100
      : 0;
  const submit = () => onOpen(value, note.trim() || undefined, counter?.id);
  const counterName = counter?.name ?? myCounter?.name;
  // Only the multi-store case shows the picker, and only then can the store be
  // missing -- a single-store till always knows where it is.
  const picksStore = !!onStoreChange && (stores?.length ?? 0) > 1;
  const panelRef = useRef<HTMLDivElement>(null);
  // Not while the till is being opened: the X is disabled then too, and a
  // dialog gone before the shift lands left nothing to say it had.
  useFocusTrap(panelRef, true, isPending ? undefined : onDismiss);

  const title = ownOnly
    ? 'Open a counter'
    : choosing
      ? 'Which till will you work on?'
      : 'Open your shift';
  const subtitle = noCounter
    ? 'No counter assigned.'
    : ownOnly
    ? 'Count the cash you start with. The other tills stay open.'
    : choosing
      ? canJoin
        ? 'Work on a till that is already open here, or open a free counter.'
        : 'This store has more than one counter. Choose the one you are at.'
      : `${counterName ? `${counterName} · ` : ''}Count the drawer before your first sale.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-shift-title"
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-lg"
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
              {title}
            </h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
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
            its counter, whose shift it is and how it is doing -- enough to
            recognise the one you are standing at. */}
        {choosing && (
          <div className="mb-4 space-y-2">
            {tills.map((sh) => (
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
                  {/* Wraps rather than truncates: the counter and whose till
                      it is are both needed to pick the right drawer. */}
                  <span className="block text-sm font-semibold text-foreground">
                    Work on {tillName(sh)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Opened {formatTime(sh.openedAt)} · {sh.salesCount} sale
                    {sh.salesCount === 1 ? '' : 's'} · float {formatMoney(sh.openingFloat)}
                  </span>
                </span>
              </button>
            ))}
            {canJoin && freeCounters.length > 0 && (
              <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground" aria-hidden="true">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
            )}
            {freeCounters.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={isPending}
                aria-pressed={counter?.id === c.id}
                onClick={() => {
                  setPicked(c.id);
                  setTyped(null); // each drawer's float is its own
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-muted/50 disabled:opacity-50',
                  counter?.id === c.id ? 'border-primary bg-muted/50' : 'border-border',
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">Open {c.name}</span>
                  {/* A cashier's counter: they will sell into this till when
                      they arrive, so say so before the owner takes it. */}
                  <span className="block text-xs text-muted-foreground">
                    {c.staff.length
                      ? `${c.staff.map((u) => u.name).join(', ')}’s counter · they’ll work on your till when they arrive`
                      : 'Free · its own cash count and Z report'}
                  </span>
                </span>
              </button>
            ))}
            {canJoin && freeCounters.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Every counter here is open. Add another in Settings → Stores to open one of your own.
              </p>
            )}
          </div>
        )}

        {/* A header request for a counter when every one is taken. */}
        {ownOnly && freeCounters.length === 0 && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Every counter at this store is open. Add another in Settings → Stores.
          </p>
        )}

        {/* A cashier with no counter has nothing to open: say what to do
            instead of letting them count a float the server will refuse. */}
        {noCounter && (
          <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
            You aren’t assigned to a counter yet. Ask the owner or a manager to choose one for you in Staff.
          </p>
        )}

        {!noCounter && showOpen && (ownOnly ? !!counter : true) && (
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
                placeholder="e.g. covering for Hari"
              />
            </Field>

            <Button
              className="mt-5 h-11 w-full"
              loading={isPending}
              disabled={picksStore && !storeId}
              onClick={submit}
            >
              {counter && (choosing || ownOnly) ? `Open ${counter.name} with` : 'Open shift with'} {formatMoney(value)}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
