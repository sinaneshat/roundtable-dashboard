import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type React from 'react';

import { redirectIfAuthenticated } from '@/app/auth/actions';
import { AuthShowcaseLayout } from '@/components/auth/auth-showcase-layout';
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

/**
 * Auth Flow Layout - Handles authenticated user redirects
 *
 * NOTE: No Suspense here - child components (AuthForm, etc.) have their own
 * Suspense boundaries for client hooks per Next.js 15 requirements.
 * Avoids double loading states.
 */
export default async function AuthLayoutPage({ children }: AuthLayoutPageProps) {
  // Redirect authenticated users to dashboard
  await redirectIfAuthenticated();

  // Create query client for streaming SSR support
  const queryClient = getQueryClient();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AuthShowcaseLayout>{children}</AuthShowcaseLayout>
    </HydrationBoundary>
  );
}
