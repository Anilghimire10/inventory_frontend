import { useMemo } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { acceptedTenders } from '@/lib/payment-methods';
import type { PaymentMethod } from '@/types';

/** The tenders this shop takes, for a payment picker. See `acceptedTenders`. */
export function useAcceptedTenders(keep?: PaymentMethod) {
  const { user } = useAuth();
  const accepted = user?.business?.acceptedTenders;
  return useMemo(() => acceptedTenders(accepted, keep), [accepted, keep]);
}
