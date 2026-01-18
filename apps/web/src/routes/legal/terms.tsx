import { createFileRoute } from '@tanstack/react-router';

import TermsScreen from '@/containers/screens/legal/TermsScreen';

const siteUrl = 'https://roundtable.now';
const pageTitle = 'Terms of Service - Roundtable';
const pageDescription = 'Terms of Service for Roundtable - Read our terms and conditions for using the platform.';

export const Route = createFileRoute('/legal/terms')({
  component: TermsScreen,
  // SSG: This page is static and can be prerendered
  preload: true,
  head: () => ({
    meta: [
      { title: pageTitle },
      { name: 'description', content: pageDescription },
      // Open Graph
      { property: 'og:title', content: pageTitle },
      { property: 'og:description', content: pageDescription },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: `${siteUrl}/legal/terms` },
      // SEO
      { name: 'robots', content: 'index, follow' },
    ],
    links: [
      { rel: 'canonical', href: `${siteUrl}/legal/terms` },
    ],
  }),
});
