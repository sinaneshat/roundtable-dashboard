'use client';

import posthog from 'posthog-js';
import { useEffect } from 'react';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Global Error Boundary
 *
 * NOTE: This component must be minimal and avoid context-dependent libraries
 * to prevent useContext errors during Next.js 16 prerendering.
 * See: https://github.com/vercel/next.js/issues/85668
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Report error to PostHog (only runs client-side after hydration)
    if (typeof window !== 'undefined') {
      posthog.captureException(error, {
        digest: error.digest,
        errorBoundary: 'global',
      });
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-black text-white">
        <div className="flex min-h-dvh items-center justify-center p-4">
          <div className="max-w-lg text-center">
            <div className="mb-4 text-4xl">⚠️</div>
            <h1 className="mb-2 text-2xl font-semibold">Something went wrong</h1>
            <p className="mb-6 text-gray-400">
              An unexpected error occurred. Please try again.
            </p>
            {error.digest && (
              <p className="mb-4 text-xs text-gray-500">
                Error ID:
                {' '}
                {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              className="rounded-lg bg-white px-6 py-2 text-black hover:bg-gray-200"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
