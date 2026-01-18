import { createFileRoute } from '@tanstack/react-router';

import PrivacyScreen from '@/containers/screens/legal/PrivacyScreen';
import { getAppBaseUrl } from '@/lib/config/base-urls';

const pageTitle = 'Privacy Policy - Roundtable';
const pageDescription = 'Privacy Policy for Roundtable - Learn how we collect, use, and protect your data.';

export const Route = createFileRoute('/legal/privacy')({
  component: PrivacyScreen,
  // SSG: This page is static and can be prerendered
  preload: true,
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
        // SEO
        { name: 'robots', content: 'index, follow' },
      ],
      links: [
        { rel: 'canonical', href: `${siteUrl}/legal/privacy` },
      ],
    };
  },
});
