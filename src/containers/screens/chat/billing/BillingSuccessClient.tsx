'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ScaleIn, StaggerContainer, StaggerItem } from '@/components/ui/motion';
import { queryKeys } from '@/lib/data/query-keys';

/**
 * Billing Success Client Component
 *
 * This component receives pre-synced subscription data from server action.
 * Following Next.js App Router pattern: server-side data fetching → hydrated client component
 *
 * Key Features:
 * - Receives synced subscription data as props (no loading states)
 * - Invalidates client-side queries for quota/stats APIs
 * - Shows success animation immediately
 * - Auto-redirects to pricing page after countdown
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
  const queryClient = useQueryClient();
  const [redirectCountdown, setRedirectCountdown] = useState(3);

  // Invalidate client-side queries for quota/stats on mount
  // This ensures UI components refetch with new subscription limits
  useEffect(() => {
    if (syncedData?.synced) {
      // Invalidate all billing-related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });

      // CRITICAL: Invalidate usage queries to reflect new quota limits
      queryClient.invalidateQueries({ queryKey: queryKeys.usage.all });
    }
  }, [syncedData, queryClient]);

  // Countdown and redirect to chat home
  useEffect(() => {
    if (redirectCountdown > 0) {
      const timer = setTimeout(() => {
        setRedirectCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }

    if (redirectCountdown === 0) {
      router.push('/chat');
    }

    return undefined;
  }, [redirectCountdown, router]);

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
          <p className="text-xs text-muted-foreground md:text-sm">
            {t('billing.success.redirecting', { count: redirectCountdown })}
          </p>

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
