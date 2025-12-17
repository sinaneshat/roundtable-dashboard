import { useTranslations } from 'next-intl';
import type React from 'react';
import { Suspense } from 'react';

import { AuthShowcaseLayout } from '@/components/auth/auth-showcase-layout';
import { PageLoadingFallback } from '@/components/loading';

type ErrorLayoutProps = {
  children: React.ReactNode;
};

/**
 * Error page layout - NO auth check
 *
 * This layout is separate from the main auth flow layout because:
 * 1. Error pages should be statically generated (force-static)
 * 2. Auth initialization requires BETTER_AUTH_SECRET at build time
 * 3. Users viewing error pages may not be authenticated
 *
 * Per Next.js + OpenNext Cloudflare patterns, pages needing runtime
 * secrets should use force-dynamic, but error pages are better static.
 */
function ErrorLayoutContent({ children }: { children: React.ReactNode }) {
  const t = useTranslations('states.loading');

  return (
    <Suspense fallback={<PageLoadingFallback text={t('errorDetails')} />}>
      <AuthShowcaseLayout>{children}</AuthShowcaseLayout>
    </Suspense>
  );
}

export default function ErrorLayout({ children }: ErrorLayoutProps) {
  return <ErrorLayoutContent>{children}</ErrorLayoutContent>;
}
