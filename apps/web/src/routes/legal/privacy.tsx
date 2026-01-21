import { createFileRoute } from '@tanstack/react-router';

import PrivacyScreen from '@/containers/screens/legal/PrivacyScreen';
import { getAppBaseUrl } from '@/lib/config/base-urls';

const pageTitle = 'Privacy Policy - Roundtable';
const pageDescription = 'Privacy Policy for Roundtable - Learn how we collect, use, and protect your data.';

export const Route = createFileRoute('/legal/privacy')({
  component: PrivacyScreen,
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
        { property: 'og:url', content: `${siteUrl}/legal/privacy` },
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
        { rel: 'canonical', href: `${siteUrl}/legal/privacy` },
      ],
    };
  },
});
