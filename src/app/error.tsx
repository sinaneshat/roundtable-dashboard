'use client';

import { useEffect } from 'react';

import ErrorScreen from '@/containers/screens/errors/ErrorScreen';

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

    if (process.env.NODE_ENV === 'development') {
      if (error.message.includes('Module') && error.message.includes('was instantiated')) {
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
