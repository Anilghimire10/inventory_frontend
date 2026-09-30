'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SubscriptionExpiredPage from '@/screens/SubscriptionExpiredPage';

// This screen sits outside the app's layout (the shop is locked), which is
// where React Query is provided -- but it now loads how to pay and takes an
// "I've paid" report, so it gets a client of its own.
export default function Page() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <SubscriptionExpiredPage />
    </QueryClientProvider>
  );
}
