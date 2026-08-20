'use client';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/auth/AuthContext';

/**
 * Providers shared by EVERY page (public auth pages + the app).
 *
 * Public pages don't use React Query or toasts, so those are mounted in
 * `app/(app)/layout.tsx` instead — keeping ~40KB of client JS off the
 * login/register/forgot-password bundles.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}