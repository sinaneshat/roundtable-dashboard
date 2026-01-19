import { createFileRoute } from '@tanstack/react-router';

import TermsScreen from '@/containers/screens/legal/TermsScreen';
import { getAppBaseUrl } from '@/lib/config/base-urls';

const pageTitle = 'Terms of Service - Roundtable';
const pageDescription = 'Terms of Service for Roundtable - Read our terms and conditions for using the platform.';

export const Route = createFileRoute('/legal/terms')({
  component: TermsScreen,
  // SSG: This page is static and can be prerendered
  preload: true,
  // ✅ ISR: Static content - cache for 7 days at CDN, serve stale for 30 days
  headers: () => ({
    'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000, immutable',
  }),
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
        { property: 'og:url', content: `${siteUrl}/legal/terms` },
        { property: 'og:image', content: `${siteUrl}/static/og-image.png` },
        { property: 'og:site_name', content: 'Roundtable' },
        // Twitter
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:site', content: '@roundtablenow' },
        { name: 'twitter:title', content: pageTitle },
        { name: 'twitter:description', content: pageDescription },
        { name: 'twitter:image', content: `${siteUrl}/static/og-image.png` },
        // SEO
        { name: 'robots', content: 'index, follow' },
      ],
      links: [
        { rel: 'canonical', href: `${siteUrl}/legal/terms` },
      ],
    };
  },
});
