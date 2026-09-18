'use client';
import { Select } from '@/components/ui/select';
import { useStores } from '@/hooks/useStores';
import { useAuth } from '@/auth/AuthContext';
import { ALL_STORES, useStoreScope } from '@/store/StoreContext';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types';

// ALL_STORES lives with the shared scope it belongs to; re-exported here so
// the existing `from '@/components/StorePicker'` imports keep working.
export { ALL_STORES } from '@/store/StoreContext';

/**
 * Mirrors the backend's StoreScopeGuard: a cashier or stock keeper with a
 * store assigned may only ever act on that one. Owners and managers move
 * between branches, and staff with no store assigned are not confined.
 */
function isPinnedToStore(user: { role: UserRole; storeId?: string | null } | null) {
  if (!user) return false;
  if (user.role === 'OWNER' || user.role === 'MANAGER') return false;
  return !!user.storeId;
}

/**
 * Store filter for the report screens (dashboard, analytics, tax, sales).
 *
 * Unlike the pickers that record new stock or purchases, this one offers
 * *deactivated* stores too: a closed branch's sales are still real history and
 * still belong in a report covering a range it was trading in. `useStores`
 * rather than `useActiveStores` is deliberate.
 *
 * Renders nothing for a single-store business — which is most of them — so no
 * screen carries a filter with exactly one thing to filter by.
 *
 * Also renders nothing for a cashier or stock keeper who is assigned to a
 * store: the API confines them to it, so every option but their own would come
 * back 403 and the one that works is already what they are seeing.
 */
export function StorePicker({
  value,
  onChange,
  className,
  wrapperClassName,
}: {
  value: string;
  onChange: (storeId: string) => void;
  className?: string;
  /**
   * Sizing for a wrapper around the control, for filter bars whose other
   * fields are wrapped the same way. It belongs here rather than around
   * `<StorePicker>` at the call site: this renders nothing for a single-store
   * business, and a leftover `w-full` wrapper would still take a whole row of
   * a wrapping flex bar on a phone.
   */
  wrapperClassName?: string;
}) {
  const { data: stores } = useStores();
  const { user } = useAuth();

  if (!stores || stores.length < 2) return null;
  if (isPinnedToStore(user)) return null;

  const select = (
    <Select
      aria-label="Filter by store"
      className={cn('h-8 w-auto', className)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value={ALL_STORES}>All stores</option>
      {stores.map((s) => (
        <option key={s.id} value={s.id}>
          {s.isActive ? s.name : `${s.name} (deactivated)`}
        </option>
      ))}
    </Select>
  );

  return wrapperClassName ? <div className={wrapperClassName}>{select}</div> : select;
}

/**
 * How the current store filter should read inside a report's subtitle, e.g.
 * "…, last 30 days, Main Branch". Returns null while the stores are still
 * loading, or when the business has nothing to choose between — a single-store
 * shop shouldn't be told which store it is looking at.
 */
/**
 * The app-wide store switcher, for the header. Changing it moves every screen
 * — dashboard, analytics, products, sales and the stock pages — to that branch
 * at once. Renders nothing when there is nothing to switch between.
 */
export function GlobalStorePicker() {
  const { storeId, setStoreId, canSwitch } = useStoreScope();
  const { data: stores } = useStores();
  if (!canSwitch || !stores) return null;
  return (
    <Select
      aria-label="Store"
      className="h-8 w-auto"
      value={storeId}
      onChange={(e) => setStoreId(e.target.value)}
    >
      <option value={ALL_STORES}>All stores</option>
      {stores.map((s) => (
        <option key={s.id} value={s.id}>
          {s.isActive ? s.name : `${s.name} (deactivated)`}
        </option>
      ))}
    </Select>
  );
}

export function useStoreLabel(storeId: string): string | null {
  const { data: stores } = useStores();
  const { user } = useAuth();
  if (!stores || stores.length < 2) return null;
  // Pinned staff have nothing to disambiguate — they only ever see one store.
  if (isPinnedToStore(user)) return null;
  if (storeId === ALL_STORES) return 'all stores';
  return stores.find((s) => s.id === storeId)?.name ?? null;
}
