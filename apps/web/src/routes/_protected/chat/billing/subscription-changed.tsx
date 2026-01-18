import { createFileRoute } from '@tanstack/react-router';

import { BillingSuccessSkeleton } from '@/components/billing/billing-success-skeleton';
import { SubscriptionChangedClient } from '@/containers/screens/chat/billing/SubscriptionChangedClient';

const pageTitle = 'Subscription Updated - Roundtable';
const pageDescription = 'Your subscription has been updated successfully.';

export const Route = createFileRoute('/_protected/chat/billing/subscription-changed')({
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
