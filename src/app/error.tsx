'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { useEffect } from 'react';

import ErrorScreen from '@/containers/screens/errors/ErrorScreen';
import { useSession } from '@/lib/auth/client';

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: ErrorProps) {
  const posthog = usePostHog();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  useEffect(() => {
    posthog.captureException(error, {
      digest: error.digest,
      errorBoundary: 'route',
      // Enhanced context
      pathname,
      searchParams: searchParams?.toString(),
      userId: session?.user?.id,
      userEmail: session?.user?.email,
      authenticated: !!session?.user,
    });
  }, [error, posthog, pathname, searchParams, session]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development')
      return;
    if (!error.message.includes('Module') || !error.message.includes('was instantiated'))
      return;

    const timeoutId = setTimeout(reset, 1000);
    return () => clearTimeout(timeoutId);
  }, [error, reset]);

  return (
    <ErrorScreen
      reset={reset}
      error={{
        message: error.message,
        stack: error.stack,
        digest: error.digest,
      }}
    />
  );
}
