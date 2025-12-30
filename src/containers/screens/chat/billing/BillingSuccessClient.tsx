'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';

import type { SubscriptionTier } from '@/api/core/enums';
import { StripeSubscriptionStatuses } from '@/api/core/enums';
import { getMaxModelsForTier, getMonthlyCreditsForTier } from '@/api/services/product-logic.service';
import { PlanOverviewCard, StatusPage, StatusPageActions } from '@/components/billing';
import { useSyncAfterCheckoutMutation } from '@/hooks/mutations';
import { useCurrentSubscriptionQuery, useSubscriptionsQuery, useUsageStatsQuery } from '@/hooks/queries';
import { useCountdownRedirect } from '@/hooks/utils';

/**
 * Billing Success Client - Subscriptions Only
 *
 * Theo's "Stay Sane with Stripe" pattern:
 * This component handles ONLY subscription purchases.
 * Credit pack purchases use the separate CreditsSuccessClient component.
 *
 * Flow:
 * 1. Sync subscription data from Stripe
 * 2. Display subscription confirmation
 * 3. Auto-redirect to chat
 */
export function BillingSuccessClient() {
  const router = useRouter();
  const t = useTranslations();
  const [isReady, setIsReady] = useState(false);

  const { countdown } = useCountdownRedirect({
    enabled: isReady,
    redirectPath: '/chat',
  });

  const syncMutation = useSyncAfterCheckoutMutation();

  const subscriptionsQuery = useSubscriptionsQuery({ forceEnabled: true });
  const currentSubscriptionQuery = useCurrentSubscriptionQuery({ forceEnabled: true });
  const usageStatsQuery = useUsageStatsQuery({ forceEnabled: true });

  const hasInitiatedSync = useRef(false);
  const readyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const subscriptionData = subscriptionsQuery.data;
  const currentSubscription = currentSubscriptionQuery.data;
  const usageStats = usageStatsQuery.data;

  // Extract sync result - use this as source of truth for tier
  const syncResult = syncMutation.data;
  const syncedCreditsBalance = syncResult?.data?.creditsBalance;
  const syncedTier = syncResult?.data?.tierChange?.newTier;

  const displaySubscription = useMemo(() => {
    return (
      currentSubscription?.data?.items?.find(sub => sub.status === StripeSubscriptionStatuses.ACTIVE)
      ?? currentSubscription?.data?.items?.[0]
      ?? subscriptionData?.data?.items?.[0]
      ?? null
    );
  }, [currentSubscription, subscriptionData]);

  useEffect(() => {
    if (!hasInitiatedSync.current) {
      syncMutation.mutate(undefined);
      hasInitiatedSync.current = true;
      // Prefetch /chat early - user will navigate there after success
      router.prefetch('/chat');
    }
  }, [syncMutation, router]);

  useEffect(() => {
    if (isReady || !syncMutation.isSuccess) {
      return;
    }

    const queriesFetched
      = subscriptionsQuery.isFetched && !subscriptionsQuery.isFetching
        && usageStatsQuery.isFetched && !usageStatsQuery.isFetching;

    if (queriesFetched) {
      startTransition(() => setIsReady(true));
      return;
    }

    if (readyTimeoutRef.current) {
      clearTimeout(readyTimeoutRef.current);
    }

    readyTimeoutRef.current = setTimeout(() => {
      setIsReady(true);
      readyTimeoutRef.current = null;
    }, 2000);

    return () => {
      if (readyTimeoutRef.current) {
        clearTimeout(readyTimeoutRef.current);
        readyTimeoutRef.current = null;
      }
    };
  }, [
    syncMutation.isSuccess,
    subscriptionsQuery.isFetched,
    subscriptionsQuery.isFetching,
    usageStatsQuery.isFetched,
    usageStatsQuery.isFetching,
    isReady,
  ]);

  const isLoadingData = syncMutation.isPending || (!isReady && !syncMutation.isError);

  if (isLoadingData) {
    return (
      <StatusPage
        variant="loading"
        title={t('billing.success.processingSubscription')}
        description={t('billing.success.confirmingPayment')}
      />
    );
  }

  if (syncMutation.isError) {
    return (
      <StatusPage
        variant="error"
        title={t('billing.failure.syncFailed')}
        description={t('billing.failure.syncFailedDescription')}
        actions={(
          <StatusPageActions
            primaryLabel={t('actions.goHome')}
            primaryOnClick={() => router.replace('/chat')}
          />
        )}
      />
    );
  }

  // Subscription data - use sync result tier as source of truth (prevents stale usageStats)
  // syncedTier comes from sync-after-checkout which has fresh data from Stripe
  // SubscriptionTier values: 'free' | 'pro' - anything not 'free' is paid
  const isPaidPlan = (syncedTier !== undefined && syncedTier !== 'free') || (syncedTier === undefined && usageStats?.data?.plan?.type === 'paid');
  const currentTier: SubscriptionTier = isPaidPlan ? 'pro' : 'free';
  const tierName = isPaidPlan ? 'Pro' : 'Free';
  const maxModels = getMaxModelsForTier(currentTier);
  const creditsBalance = syncedCreditsBalance ?? usageStats?.data?.credits?.available ?? 0;
  const monthlyCredits = getMonthlyCreditsForTier(currentTier);

  const formatCredits = (credits: number) => credits.toLocaleString();

  // Use different title/description for free plan card connection vs pro subscription
  const successTitle = isPaidPlan
    ? t('billing.success.title')
    : t('billing.success.cardConnected.title');
  const successDescription = isPaidPlan
    ? t('billing.success.description')
    : t('billing.success.cardConnected.description');

  return (
    <StatusPage
      variant="success"
      title={successTitle}
      description={successDescription}
      actions={(
        <StatusPageActions
          primaryLabel={t('billing.success.startChat')}
          primaryOnClick={() => router.replace('/chat')}
          secondaryLabel={t('billing.success.viewPricing')}
          secondaryOnClick={() => router.replace('/chat/pricing')}
        />
      )}
    >
      {displaySubscription && (
        <PlanOverviewCard
          tierName={tierName}
          description={isPaidPlan ? '1,000,000 credits per month' : '10,000 free credits added to your account'}
          status={isPaidPlan ? displaySubscription.status : 'Connected'}
          stats={[
            { label: 'Models', value: maxModels },
            { label: 'Credits', value: formatCredits(creditsBalance) },
            { label: isPaidPlan ? 'Monthly' : 'Bonus', value: isPaidPlan ? formatCredits(monthlyCredits) : 'One-time' },
          ]}
          activeUntil={isPaidPlan && displaySubscription.currentPeriodEnd
            ? new Date(displaySubscription.currentPeriodEnd).toLocaleDateString()
            : undefined}
        />
      )}

      <p className="text-xs text-muted-foreground">
        {t('billing.success.autoRedirect', { seconds: countdown })}
      </p>
    </StatusPage>
  );
}
