import type React from 'react';

import { redirectIfAuthenticated } from '@/app/auth/actions';
import { AuthShowcaseLayout } from '@/components/auth/auth-showcase-layout';

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
 * No HydrationBoundary needed - no queries prefetched here
 */
export default async function AuthLayoutPage({ children }: AuthLayoutPageProps) {
  await redirectIfAuthenticated();

  return <AuthShowcaseLayout>{children}</AuthShowcaseLayout>;
}
