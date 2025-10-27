'use client';

import { useEffect } from 'react';

import { ErrorScreen } from '@/containers/screens/errors';

// Force dynamic rendering to prevent static generation issues
export const dynamic = 'force-dynamic';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // Log development errors but don't crash the app
    if (process.env.NODE_ENV === 'development') {
      // Development error caught by error boundary

      // Auto-recovery for common Turbopack HMR issues
      if (error.message.includes('Module') && error.message.includes('was instantiated')) {
        // Attempting automatic recovery from HMR module error...
        // Small delay then reset to allow HMR to stabilize
        timeoutId = setTimeout(() => {
          reset();
        }, 1000);
      }
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [error, reset]);

  return <ErrorScreen error={error} reset={reset} />;
}
