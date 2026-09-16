import { useQuery } from '@tanstack/react-query';
import { StoresApi } from '@/api';

/**
 * Loads the business's stores (cached). Most businesses have just one.
 * Includes deactivated stores — Settings needs them to list and reactivate.
 */
export function useStores() {
  return useQuery({
    queryKey: ['stores'],
    queryFn: () => StoresApi.list(),
    staleTime: 5 * 60_000,
  });
}

/**
 * Active stores only — what a picker should offer when recording new stock or
 * purchases. A deactivated store keeps its history but must stop taking new
 * movements, which is the whole point of deactivating it.
 */
export function useActiveStores() {
  const q = useStores();
  return { ...q, data: q.data?.filter((s) => s.isActive) };
}
