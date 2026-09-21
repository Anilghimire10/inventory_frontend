'use client';
import { useEffect } from 'react';
import '../index.css';

/**
 * Last-resort boundary: catches an error thrown by the root layout itself
 * (rare, but if it happens this replaces <html> entirely, so it can't rely
 * on Providers/toast context -- just a plain reload prompt).
 */
export default function GlobalError({
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
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            The app hit an unexpected error. Reloading usually fixes this.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
