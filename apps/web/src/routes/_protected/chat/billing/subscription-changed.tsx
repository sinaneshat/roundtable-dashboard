import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { BillingSuccessSkeleton } from '@/components/billing/billing-success-skeleton';
import { SubscriptionChangedClient } from '@/containers/screens/chat/billing/SubscriptionChangedClient';
import { getAppBaseUrl } from '@/lib/config/base-urls';

const pageTitle = 'Subscription Updated - Roundtable';
const pageDescription = 'Your subscription has been updated successfully.';

const subscriptionChangedSearchSchema = z.object({
  changeType: z.string().optional(),
  oldProductId: z.string().optional(),
});

export const Route = createFileRoute('/_protected/chat/billing/subscription-changed')({
  validateSearch: subscriptionChangedSearchSchema,
  component: SubscriptionChangedClient,
  pendingComponent: BillingSuccessSkeleton,
  ssr: false,
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
        { property: 'og:url', content: `${siteUrl}/chat/billing/subscription-changed` },
        { property: 'og:site_name', content: 'Roundtable' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:site', content: '@roundtablenow' },
        { name: 'twitter:title', content: pageTitle },
        { name: 'twitter:description', content: pageDescription },
      ],
      links: [
        { rel: 'canonical', href: `${siteUrl}/chat/billing/subscription-changed` },
      ],
    };
  },
});
