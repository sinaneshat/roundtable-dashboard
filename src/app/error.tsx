'use client';

import { useEffect } from 'react';

import ErrorScreen from '@/containers/screens/errors/ErrorScreen';

export const dynamic = 'force-dynamic';

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development')
      return;
    if (!error.message.includes('Module') || !error.message.includes('was instantiated'))
      return;

    const timeoutId = setTimeout(reset, 1000);
    return () => clearTimeout(timeoutId);
  }, [error, reset]);

  return <ErrorScreen reset={reset} />;
}
