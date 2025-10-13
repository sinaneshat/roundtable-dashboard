import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type React from 'react';
import { Suspense } from 'react';

import { redirectIfAuthenticated } from '@/app/auth/actions';
import { AuthLayout } from '@/components/layouts';
import { PageLoadingFallback } from '@/components/loading';
import { getQueryClient } from '@/lib/data/query-client';

type AuthLayoutPageProps = {
  children: React.ReactNode;
};

export default async function AuthLayoutPage({ children }: AuthLayoutPageProps) {
  // Redirect authenticated users to dashboard
  await redirectIfAuthenticated();

  // Create query client for streaming SSR support
  const queryClient = getQueryClient();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<PageLoadingFallback text="Loading authentication..." />}>
        <AuthLayout>{children}</AuthLayout>
      </Suspense>
    </HydrationBoundary>
  );
}
