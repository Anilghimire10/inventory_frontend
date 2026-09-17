'use client';
import { Select } from '@/components/ui/select';
import { useStores } from '@/hooks/useStores';
import { cn } from '@/lib/utils';

/** Value meaning "don't filter" — what the reports endpoints expect for all stores. */
export const ALL_STORES = '';

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

  if (!stores || stores.length < 2) return null;

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
export function useStoreLabel(storeId: string): string | null {
  const { data: stores } = useStores();
  if (!stores || stores.length < 2) return null;
  if (storeId === ALL_STORES) return 'all stores';
  return stores.find((s) => s.id === storeId)?.name ?? null;
}
