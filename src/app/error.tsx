'use client';
import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/misc';

/**
 * Route-level boundary: catches a render error anywhere under this layout
 * (e.g. a bad response shape) and offers a retry instead of the framework's
 * default blank/dev-overlay screen, which a cashier mid-sale can't recover from.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <ErrorState
        title="Something went wrong"
        description="This page hit an unexpected error. Try again, or reload if it keeps happening."
        onRetry={reset}
      />
    </div>
  );
}
