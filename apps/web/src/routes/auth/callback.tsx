import { createFileRoute, redirect } from '@tanstack/react-router';

import { getAppBaseUrl } from '@/lib/config/base-urls';

const pageTitle = 'Signing In - Roundtable';
const pageDescription = 'Completing authentication...';

export const Route = createFileRoute('/auth/callback')({
  beforeLoad: async () => {
    throw redirect({ to: '/chat' });
  },
  component: () => (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Redirecting...</div>
    </div>
  ),
  head: () => {
    const siteUrl = getAppBaseUrl();
    return {
      meta: [
        { title: pageTitle },
        { name: 'description', content: pageDescription },
        { name: 'robots', content: 'noindex, nofollow' },
        { property: 'og:title', content: pageTitle },
        { property: 'og:description', content: pageDescription },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: `${siteUrl}/auth/callback` },
        { property: 'og:site_name', content: 'Roundtable' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:site', content: '@roundtablenow' },
        { name: 'twitter:title', content: pageTitle },
        { name: 'twitter:description', content: pageDescription },
      ],
    };
  },
});
