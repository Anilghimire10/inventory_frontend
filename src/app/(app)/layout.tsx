'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/auth/AuthContext';
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
  return <AppLayout>{children}</AppLayout>;
}
