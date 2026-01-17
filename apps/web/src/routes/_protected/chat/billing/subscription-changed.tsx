import { createFileRoute } from '@tanstack/react-router';

import { SubscriptionChangedClient } from '@/containers/screens/chat/billing/SubscriptionChangedClient';

export const Route = createFileRoute('/_protected/chat/billing/subscription-changed')({
  component: SubscriptionChangedClient,
});
