import type React from 'react';

import { AuthShowcaseLayout } from '@/components/auth/auth-showcase-layout';

type AuthLayoutPageProps = {
  children: React.ReactNode;
};

/**
 * Auth Flow Layout - Static layout for auth pages
 *
 * Authenticated user redirects are handled in middleware.ts (cookie-based).
 * This allows auth pages to be SSG/ISR instead of dynamic.
 */
export default function AuthLayoutPage({ children }: AuthLayoutPageProps) {
  return <AuthShowcaseLayout>{children}</AuthShowcaseLayout>;
}
