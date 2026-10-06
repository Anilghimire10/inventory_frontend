'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { ShiftProvider } from '@/shift/ShiftContext';
import { StoreScopeProvider } from '@/store/StoreContext';
import AppLayout from '@/components/layout/AppLayout';
import { Menu, Package } from 'lucide-react';
import { ErrorState, Skeleton } from '@/components/ui/misc';
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

  if (loading || !user || !allowed) return <ShellSkeleton />;
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

/**
 * The app's frame -- sidebar, header, a page title -- before there is a user
 * to fill it. It is also what every app page's prerendered HTML holds, so the
 * first paint already looks like the app rather than a centred spinner.
 */
function ShellSkeleton() {
  return (
    <div className="flex min-h-screen" role="status" aria-label="Loading">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Package className="h-4 w-4" />
          </div>
          <span className="font-semibold">Inventory</span>
        </div>
        <div className="space-y-2 p-3">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b border-border px-4 lg:px-6">
          {/* The real menu icon, not a grey block: browsers only count text
              and images as a first paint, and on a phone this is the one. */}
          <Menu className="h-5 w-5 text-muted-foreground lg:hidden" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </header>
        <main className="flex-1 space-y-3 p-4 lg:p-6">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </main>
      </div>
    </div>
  );
}
