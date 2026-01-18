import { createFileRoute } from '@tanstack/react-router';

import { BillingSuccessSkeleton } from '@/components/billing/billing-success-skeleton';
import { BillingSuccessClient } from '@/containers/screens/chat/billing/BillingSuccessClient';

const pageTitle = 'Subscription Successful - Roundtable';
const pageDescription = 'Your subscription has been activated. Welcome to Roundtable!';

export const Route = createFileRoute('/_protected/chat/billing/subscription-success')({
  component: BillingSuccessClient,
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
