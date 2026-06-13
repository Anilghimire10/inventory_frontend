import { useQuery } from '@tanstack/react-query';
import { StoresApi } from '@/api';

/** Loads the business's stores (cached). Most businesses have just one. */
export function useStores() {
  return useQuery({
    queryKey: ['stores'],
    queryFn: () => StoresApi.list(),
    staleTime: 5 * 60_000,
  });
}
