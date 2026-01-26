import { createFileRoute } from '@tanstack/react-router';

import PrivacyScreen from '@/containers/screens/legal/PrivacyScreen';
import { getAppBaseUrl } from '@/lib/config/base-urls';

const pageTitle = 'Privacy Policy - Roundtable';
const pageDescription = 'Privacy Policy for Roundtable - Learn how we collect, use, and protect your data.';

export const Route = createFileRoute('/legal/privacy')({
  component: PrivacyScreen,
  head: () => {
    const siteUrl = getAppBaseUrl();
    return {
      links: [
        { href: `${siteUrl}/legal/privacy`, rel: 'canonical' },
      ],
      meta: [
        { title: pageTitle },
        { content: pageDescription, name: 'description' },
        // Open Graph
        { content: pageTitle, property: 'og:title' },
        { content: pageDescription, property: 'og:description' },
        { content: 'website', property: 'og:type' },
        { content: `${siteUrl}/legal/privacy`, property: 'og:url' },
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
