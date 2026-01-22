import { createFileRoute } from '@tanstack/react-router';

import ChatOverviewScreen from '@/containers/screens/chat/ChatOverviewScreen';
import { getAppBaseUrl } from '@/lib/config/base-urls';
import { getServerQuickStartData } from '@/lib/config/quick-start-config';

const pageTitle = 'Chat - Roundtable';
const pageDescription = 'Start a new AI conversation with multiple models.';

export const Route = createFileRoute('/_protected/chat/')({
  // Server-side random selection - no client-side skeleton flash
  loader: () => getServerQuickStartData(),
  component: ChatOverviewScreen,
  // Protected routes should not be indexed
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
        { property: 'og:url', content: `${siteUrl}/chat` },
        { property: 'og:site_name', content: 'Roundtable' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:site', content: '@roundtablenow' },
        { name: 'twitter:title', content: pageTitle },
        { name: 'twitter:description', content: pageDescription },
      ],
      links: [
        { rel: 'canonical', href: `${siteUrl}/chat` },
      ],
    };
  },
});
