'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { ShiftProvider } from '@/shift/ShiftContext';
import { StoreScopeProvider } from '@/store/StoreContext';
import AppLayout from '@/components/layout/AppLayout';
import { ErrorState, LoadingBlock } from '@/components/ui/misc';
import { MaintenanceBanner } from '@/components/layout/MaintenanceBanner';
import { canAccessPath } from '@/components/layout/nav';
import { LiveUpdates } from '@/components/LiveUpdates';

/**
 * Gate for all in-app routes:
 *  - unauthenticated → /login
 *  - authenticated but role can't access this path → /dashboard
 */
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, unreachable, retry } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  // React Query lives only inside the authenticated area — public pages never
  // download its ~40KB bundle.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Back on the tab after a while (30s stale), a screen asks again, so
          // what another till or the owner's phone changed shows up without a
          // reload. A form seeded from a query (the stock take's count sheet)
          // opts out, or coming back would replace what was typed.
          queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 30_000 },
        },
      }),
  );

  useEffect(() => {
    // A saved session the server couldn't confirm is still a session: stay
    // here and offer a retry rather than a login form.
    if (loading || unreachable) return;
    if (!user) {
      router.replace('/login');
    } else if (!canAccessPath(user.role, pathname)) {
      router.replace('/');
    }
  }, [loading, unreachable, user, pathname, router]);

  const allowed = !!user && canAccessPath(user.role, pathname);

  if (!loading && !user && unreachable) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        {/* Covers this with the "down for maintenance" screen when that's why. */}
        <MaintenanceBanner boxed />
        <div className="w-full max-w-md">
          <ErrorState
            title={retrying ? 'Trying again…' : "Can't reach the server"}
            description="You're still signed in. Check your connection, then retry."
            onRetry={
              retrying
                ? undefined
                : () => {
                    setRetrying(true);
                    retry().finally(() => setRetrying(false));
                  }
            }
          />
        </div>
      </div>
    );
  }

  if (loading || !user || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingBlock label="Loading…" />
      </div>
    );
  }
  return (
    <QueryClientProvider client={client}>
      <LiveUpdates />
      <StoreScopeProvider>
        <ShiftProvider>
          <AppLayout>{children}</AppLayout>
        </ShiftProvider>
      </StoreScopeProvider>
    </QueryClientProvider>
  );
}
