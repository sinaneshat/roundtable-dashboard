import { createFileRoute } from '@tanstack/react-router';

import { BillingSuccessSkeleton } from '@/components/billing/billing-success-skeleton';
import { SubscriptionChangedClient } from '@/containers/screens/chat/billing/SubscriptionChangedClient';

export const Route = createFileRoute('/_protected/chat/billing/subscription-changed')({
  component: SubscriptionChangedClient,
  pendingComponent: BillingSuccessSkeleton,
});
