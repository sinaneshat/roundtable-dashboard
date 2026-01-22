import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

import { BillingSuccessSkeleton } from '@/components/billing/billing-success-skeleton';
import { getAppBaseUrl } from '@/lib/config/base-urls';

const BillingSuccessClient = lazy(() => import('@/containers/screens/chat/billing/BillingSuccessClient').then(m => ({ default: m.BillingSuccessClient })));

const pageTitle = 'Subscription Successful - Roundtable';
const pageDescription = 'Your subscription has been activated. Welcome to Roundtable!';

function BillingSuccessRoute() {
  return (
    <Suspense fallback={<BillingSuccessSkeleton />}>
      <BillingSuccessClient />
    </Suspense>
  );
}

export const Route = createFileRoute('/_protected/chat/billing/subscription-success')({
  component: BillingSuccessRoute,
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
        { property: 'og:url', content: `${siteUrl}/chat/billing/subscription-success` },
        { property: 'og:site_name', content: 'Roundtable' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:site', content: '@roundtablenow' },
        { name: 'twitter:title', content: pageTitle },
        { name: 'twitter:description', content: pageDescription },
      ],
      links: [
        { rel: 'canonical', href: `${siteUrl}/chat/billing/subscription-success` },
      ],
    };
  },
});
