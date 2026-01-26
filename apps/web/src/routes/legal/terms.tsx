import { createFileRoute } from '@tanstack/react-router';

import TermsScreen from '@/containers/screens/legal/TermsScreen';
import { getAppBaseUrl } from '@/lib/config/base-urls';

const pageTitle = 'Terms of Service - Roundtable';
const pageDescription = 'Terms of Service for Roundtable - Read our terms and conditions for using the platform.';

export const Route = createFileRoute('/legal/terms')({
  component: TermsScreen,
  head: () => {
    const siteUrl = getAppBaseUrl();
    return {
      links: [
        { href: `${siteUrl}/legal/terms`, rel: 'canonical' },
      ],
      meta: [
        { title: pageTitle },
        { content: pageDescription, name: 'description' },
        // Open Graph
        { content: pageTitle, property: 'og:title' },
        { content: pageDescription, property: 'og:description' },
        { content: 'website', property: 'og:type' },
        { content: `${siteUrl}/legal/terms`, property: 'og:url' },
        { content: `${siteUrl}/static/og-image.png`, property: 'og:image' },
        { content: 'Roundtable', property: 'og:site_name' },
        // Twitter
        { content: 'summary_large_image', name: 'twitter:card' },
        { content: '@roundtablenow', name: 'twitter:site' },
        { content: pageTitle, name: 'twitter:title' },
        { content: pageDescription, name: 'twitter:description' },
        { content: `${siteUrl}/static/og-image.png`, name: 'twitter:image' },
        // SEO
        { content: 'index, follow', name: 'robots' },
      ],
    };
  },
  // ✅ ISR: Static content - cache for 7 days at CDN, serve stale for 30 days
  headers: () => ({
    'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000, immutable',
  }),
  // SSG: This page is static and can be prerendered
  preload: true,
});
