import { createFileRoute } from '@tanstack/react-router';

import { BillingSuccessClient } from '@/containers/screens/chat/billing/BillingSuccessClient';

export const Route = createFileRoute('/_protected/chat/billing/subscription-success')({
  component: BillingSuccessClient,
});
