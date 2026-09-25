'use client';
import { Eye } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { clearToken } from '@/lib/api';

/**
 * Shown for the whole of a "view as owner" session from the admin panel, and
 * never dismissible: whoever is looking at the screen must know they are not
 * the owner, and that nothing they try to change will save.
 */
export function ImpersonationBanner() {
  const { user } = useAuth();
  const imp = user?.impersonation;
  if (!imp) return null;

  const ends = new Date(imp.expiresAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/40 bg-warning/15 px-4 py-2 text-sm text-foreground lg:px-6"
    >
      <Eye className="h-4 w-4 shrink-0 text-warning" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-medium">
          Viewing {user.business?.name ?? 'this shop'} as {user.name}. Read-only.
        </span>{' '}
        <span className="text-muted-foreground">
          Opened from the admin panel by {imp.email} · ends at {ends}
        </span>
      </p>
      <button
        type="button"
        onClick={() => {
          clearToken();
          // The admin panel opened this tab, so it may close it; if the
          // browser won't, fall back to the sign-in page.
          window.close();
          location.replace('/login');
        }}
        className="shrink-0 rounded-md border border-warning/50 px-2.5 py-1 text-xs font-medium hover:bg-warning/20"
      >
        End session
      </button>
    </div>
  );
}
