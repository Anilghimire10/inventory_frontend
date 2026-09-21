'use client';
import { useRef } from 'react';
import { Store as StoreIcon } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import type { Store } from '@/types';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/**
 * Blocks the till until it knows which store it is selling from.
 *
 * Reachable when a user has no store assigned (Staff offers "No store
 * assigned"), or when the store they were assigned to has been deactivated.
 * Before this, such a user could fill a cart and only discover at checkout
 * that the server refused it with "No store specified for this sale".
 */
export function ChooseStoreModal({
  stores,
  onChoose,
}: {
  stores: Store[];
  onChoose: (storeId: string) => void;
}) {
  const none = stores.length === 0;
  const panelRef = useRef<HTMLDivElement>(null);
  // No onEscape: this modal blocks the till until a store is chosen, so
  // Escape must not offer a way out.
  useFocusTrap(panelRef, true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="choose-store-title"
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-lg"
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <StoreIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 id="choose-store-title" className="text-base font-semibold text-foreground">
              {none ? 'No store available' : 'Which store are you selling from?'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {none
                ? 'Every store is deactivated, so nothing can take a sale.'
                : 'Stock levels and the sale itself both follow this store.'}
            </p>
          </div>
        </div>

        {none ? (
          <p className="text-sm text-muted-foreground">
            Ask an owner to reactivate a store under Settings before using the till.
          </p>
        ) : (
          <Field label="Store">
            <Select
              autoFocus
              defaultValue=""
              onChange={(e) => e.target.value && onChoose(e.target.value)}
            >
              <option value="" disabled>
                Choose a store…
              </option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </div>
  );
}
