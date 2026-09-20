import { useQuery } from '@tanstack/react-query';
import { StoresApi } from '@/api';
import type { Store } from '@/types';

const storesQuery = {
  queryKey: ['stores'],
  queryFn: () => StoresApi.list(),
  staleTime: 5 * 60_000,
};

/**
 * Loads the business's stores (cached). Most businesses have just one.
 * Includes deactivated stores — Settings needs them to list and reactivate.
 */
export function useStores() {
  return useQuery(storesQuery);
}

// Module-level so React Query memoises the result: same array until the
// stores change, rather than a fresh one every render.
const onlyActive = (stores: Store[]) => stores.filter((s) => s.isActive);

/**
 * Active stores only — what a picker should offer when recording new stock or
 * purchases. A deactivated store keeps its history but must stop taking new
 * movements, which is the whole point of deactivating it.
 */
export function useActiveStores() {
  return useQuery({ ...storesQuery, select: onlyActive });
}
