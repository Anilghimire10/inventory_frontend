'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PaymentReturnPage from '@/screens/PaymentReturnPage';

// Outside the app's layout (the owner may have no session: a locked shop),
// so, like the lock screen, it brings its own React Query client.
export default function Page() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <PaymentReturnPage />
    </QueryClientProvider>
  );
}
