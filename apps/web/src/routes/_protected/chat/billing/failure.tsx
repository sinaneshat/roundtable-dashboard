import { createFileRoute } from '@tanstack/react-router';

import { BillingFailureClient } from '@/containers/screens/chat/billing/BillingFailureClient';

export const Route = createFileRoute('/_protected/chat/billing/failure')({
  component: BillingFailurePage,
});

function BillingFailurePage() {
  // Parse failure data from URL search params
  const searchParams = new URLSearchParams(window.location.search);

  const failureData = {
    error: searchParams.get('error') || undefined,
    errorCode: searchParams.get('errorCode') || undefined,
    errorType: searchParams.get('errorType') as any,
    stripeError: searchParams.get('stripeError') || undefined,
    timestamp: searchParams.get('timestamp') || undefined,
  };

  // Only pass failureData if at least one field has a value
  const hasData = Object.values(failureData).some(v => v !== undefined);

  return <BillingFailureClient failureData={hasData ? failureData : undefined} />;
}
