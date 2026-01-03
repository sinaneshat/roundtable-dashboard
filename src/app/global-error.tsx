'use client';

import posthog from 'posthog-js';
import { useEffect } from 'react';

import ErrorScreen from '@/containers/screens/errors/ErrorScreen';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    posthog.captureException(error, {
      digest: error.digest,
      errorBoundary: 'global',
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <ErrorScreen reset={reset} />
      </body>
    </html>
  );
}
