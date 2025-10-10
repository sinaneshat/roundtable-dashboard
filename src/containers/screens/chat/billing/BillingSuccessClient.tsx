'use client';

import { CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { ScaleIn, StaggerContainer, StaggerItem } from '@/components/ui/motion';

/**
 * Billing Success Client Component
 *
 * This component receives pre-synced subscription data from server action.
 * Following Next.js App Router pattern: server-side data fetching → hydrated client component
 *
 * ✅ NO useEffect - all data is server-hydrated via HydrationBoundary
 * ✅ No forced redirects - user clicks when ready
 * ✅ No client-side query invalidation - queries are prefetched on server
 *
 * Key Features:
 * - Receives synced subscription data as props (no loading states)
 * - Shows success animation immediately with hydrated data
 * - User-controlled navigation via button (no countdown timer)
 *
 * @param syncedData - Pre-synced subscription data from server action
 */
type BillingSuccessClientProps = {
  syncedData?: {
    synced: boolean;
    subscription: {
      status: string;
      subscriptionId: string;
    } | null;
  };
};

export function BillingSuccessClient({ syncedData }: BillingSuccessClientProps) {
  const router = useRouter();
  const t = useTranslations();

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-start px-4 pt-16 md:pt-20">
      <StaggerContainer
        className="flex flex-col items-center gap-6 text-center"
        staggerDelay={0.15}
        delayChildren={0.1}
      >
        <StaggerItem>
          <ScaleIn duration={0.3} delay={0}>
            <div className="flex size-20 items-center justify-center rounded-full bg-green-500/10 ring-4 ring-green-500/20 md:size-24">
              <CheckCircle className="size-10 text-green-500 md:size-12" strokeWidth={2} />
            </div>
          </ScaleIn>
        </StaggerItem>

        <StaggerItem className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {t('billing.success.title')}
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            {t('billing.success.description')}
          </p>
          {syncedData?.subscription && (
            <p className="text-xs text-muted-foreground">
              Subscription:
              {' '}
              {syncedData.subscription.status}
            </p>
          )}
        </StaggerItem>

        <StaggerItem className="flex flex-col items-center gap-4">
          <Button
            onClick={() => router.push('/chat')}
            size="lg"
            className="min-w-[200px]"
          >
            {t('billing.success.startChat')}
          </Button>
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}
