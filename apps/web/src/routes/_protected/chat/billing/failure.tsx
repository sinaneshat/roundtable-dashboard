import type { BillingErrorType } from '@roundtable/shared';
import { BillingErrorTypes } from '@roundtable/shared';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { BillingFailureSkeleton } from '@/components/billing/billing-failure-skeleton';
import { BillingFailureClient } from '@/containers/screens/chat/billing/BillingFailureClient';
import { getAppBaseUrl } from '@/lib/config/base-urls';

// TanStack Router search params validation schema
const billingFailureSearchSchema = z.object({
  error: z.string().optional(),
  errorCode: z.string().optional(),
  errorType: z.nativeEnum(BillingErrorTypes).optional(),
  stripeError: z.string().optional(),
  timestamp: z.string().optional(),
});

const pageTitle = 'Payment Failed - Roundtable';
const pageDescription = 'There was an issue processing your payment. Please try again or contact support.';

export const Route = createFileRoute('/_protected/chat/billing/failure')({
  component: BillingFailurePage,
  pendingComponent: BillingFailureSkeleton,
  validateSearch: billingFailureSearchSchema,
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
        { property: 'og:url', content: `${siteUrl}/chat/billing/failure` },
        { property: 'og:site_name', content: 'Roundtable' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:site', content: '@roundtablenow' },
        { name: 'twitter:title', content: pageTitle },
        { name: 'twitter:description', content: pageDescription },
      ],
      links: [
        { rel: 'canonical', href: `${siteUrl}/chat/billing/failure` },
      ],
    };
  },
});

function BillingFailurePage() {
  // Use TanStack Router's validated search params instead of window.location.search
  const search = Route.useSearch();

  const failureData = {
    error: search.error,
    errorCode: search.errorCode,
    errorType: search.errorType as BillingErrorType | undefined,
    stripeError: search.stripeError,
    timestamp: search.timestamp,
  };

  const hasData = Object.values(failureData).some(v => v !== undefined);

  return <BillingFailureClient failureData={hasData ? failureData : undefined} />;
}
