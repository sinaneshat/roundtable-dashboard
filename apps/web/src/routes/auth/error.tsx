import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { AuthShowcaseLayout } from '@/components/auth/auth-showcase-layout';
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
        // SEO - don't index error pages
        { name: 'robots', content: 'noindex, nofollow' },
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
