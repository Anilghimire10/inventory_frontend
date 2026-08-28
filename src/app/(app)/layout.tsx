'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { ShiftProvider } from '@/shift/ShiftContext';
import AppLayout from '@/components/layout/AppLayout';
import { LoadingBlock } from '@/components/ui/misc';
import { canAccessPath } from '@/components/layout/nav';

/**
 * Gate for all in-app routes:
 *  - unauthenticated → /login
 *  - authenticated but role can't access this path → /dashboard
 */
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  // React Query lives only inside the authenticated area — public pages never
  // download its ~40KB bundle.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
        },
      }),
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
    } else if (!canAccessPath(user.role, pathname)) {
      router.replace('/');
    }
  }, [loading, user, pathname, router]);

  const allowed = !!user && canAccessPath(user.role, pathname);

  if (loading || !user || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingBlock label="Loading…" />
      </div>
    );
  }
  return (
    <QueryClientProvider client={client}>
      <ShiftProvider>
        <AppLayout>{children}</AppLayout>
      </ShiftProvider>
    </QueryClientProvider>
  );
}
