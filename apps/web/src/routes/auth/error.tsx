import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { AuthShowcaseLayout } from '@/components/auth/auth-showcase-layout';
import { AuthLoadingSkeleton } from '@/components/loading';
import AuthErrorScreen from '@/containers/screens/errors/AuthErrorScreen';
import { getAppBaseUrl } from '@/lib/config/base-urls';

const pageTitle = 'Authentication Error - Roundtable';
const pageDescription = 'An error occurred during authentication. Please try again.';

// Validate error search params
const authErrorSearchSchema = z.object({
  error: z.string().optional(),
  failed: z.string().optional(),
});

export const Route = createFileRoute('/auth/error')({
  validateSearch: authErrorSearchSchema,
  component: AuthErrorPage,
  pendingComponent: AuthLoadingSkeleton,
  head: () => {
    const siteUrl = getAppBaseUrl();
    return {
      meta: [
        { title: pageTitle },
        { name: 'description', content: pageDescription },
        // Open Graph
        { property: 'og:title', content: pageTitle },
        { property: 'og:description', content: pageDescription },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: `${siteUrl}/auth/error` },
        { property: 'og:site_name', content: 'Roundtable' },
        // Twitter
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:site', content: '@roundtablenow' },
        { name: 'twitter:title', content: pageTitle },
        { name: 'twitter:description', content: pageDescription },
        // SEO - don't index error pages
        { name: 'robots', content: 'noindex, nofollow' },
      ],
      links: [
        { rel: 'canonical', href: `${siteUrl}/auth/error` },
      ],
    };
  },
});

function AuthErrorPage() {
  return (
    <AuthShowcaseLayout>
      <AuthErrorScreen />
    </AuthShowcaseLayout>
  );
}
