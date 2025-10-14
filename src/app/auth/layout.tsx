import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { Suspense } from 'react';

import { redirectIfAuthenticated } from '@/app/auth/actions';
import { AuthLayout } from '@/components/layouts';
import { PageLoadingFallback } from '@/components/loading';
import { getQueryClient } from '@/lib/data/query-client';

type AuthLayoutPageProps = {
  children: React.ReactNode;
};

function AuthLayoutContent({ children }: { children: React.ReactNode }) {
  const t = useTranslations('states.loading');

  return (
    <Suspense fallback={<PageLoadingFallback text={t('authentication')} />}>
      <AuthLayout>{children}</AuthLayout>
    </Suspense>
  );
}

export default async function AuthLayoutPage({ children }: AuthLayoutPageProps) {
  // Redirect authenticated users to dashboard
  await redirectIfAuthenticated();

  // Create query client for streaming SSR support
  const queryClient = getQueryClient();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AuthLayoutContent>{children}</AuthLayoutContent>
    </HydrationBoundary>
  );
}
