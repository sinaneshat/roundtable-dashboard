import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { BillingSuccessSkeleton } from '@/components/billing/billing-success-skeleton';
import { SubscriptionChangedClient } from '@/containers/screens/chat/billing/SubscriptionChangedClient';

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
  head: () => ({
    meta: [
      { title: pageTitle },
      { name: 'description', content: pageDescription },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
});
