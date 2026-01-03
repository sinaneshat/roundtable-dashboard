import type React from 'react';

import { redirectIfAuthenticated } from '@/app/auth/actions';
import { AuthShowcaseLayout } from '@/components/auth/auth-showcase-layout';

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
