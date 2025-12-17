import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { Suspense } from 'react';

import { redirectIfAuthenticated } from '@/app/auth/actions';
import { AuthShowcaseLayout } from '@/components/auth/auth-showcase-layout';
import { PageLoadingFallback } from '@/components/loading';
import { getQueryClient } from '@/lib/data/query-client';

// Force dynamic rendering - required because:
// 1. Layout calls redirectIfAuthenticated() which needs auth session check
// 2. Auth module requires BETTER_AUTH_SECRET which is only available at runtime
// 3. Prevents prerendering errors during Cloudflare Pages builds
// @see https://github.com/opennextjs/opennextjs-cloudflare/issues/596
export const dynamic = 'force-dynamic';

type AuthLayoutPageProps = {
  children: React.ReactNode;
};

function AuthLayoutContent({ children }: { children: React.ReactNode }) {
  const t = useTranslations('states.loading');

  return (
    <Suspense fallback={<PageLoadingFallback text={t('authentication')} />}>
      <AuthShowcaseLayout>{children}</AuthShowcaseLayout>
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
