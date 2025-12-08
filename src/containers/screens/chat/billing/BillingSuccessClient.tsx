'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { startTransition, useEffect, useRef, useState } from 'react';

import { StripeSubscriptionStatuses } from '@/api/core/enums';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { getMaxModelsForTier, getTierFromProductId, SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
import { PlanSummaryCard, StatusPage, StatusPageActions } from '@/components/billing';
import { useSyncAfterCheckoutMutation } from '@/hooks/mutations/checkout';
import { useCurrentSubscriptionQuery, useSubscriptionsQuery } from '@/hooks/queries/subscriptions';
import { useUsageStatsQuery } from '@/hooks/queries/usage';
import { useCountdownRedirect } from '@/hooks/utils';

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

  const displaySubscription
    = currentSubscription?.data?.items?.find(sub => sub.status === StripeSubscriptionStatuses.ACTIVE)
      ?? currentSubscription?.data?.items?.[0]
      ?? subscriptionData?.data?.items?.[0]
      ?? null;

  const newTier = syncMutation.data?.data?.tierChange?.newTier ?? 'free';

  useEffect(() => {
    if (!hasInitiatedSync.current) {
      syncMutation.mutate(undefined);
      hasInitiatedSync.current = true;
    }
  }, [syncMutation]);

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
        title={t('billing.success.activatingSubscription')}
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

  const tierString = displaySubscription?.price?.productId
    ? getTierFromProductId(displaySubscription.price.productId)
    : 'free';

  const validTiers: SubscriptionTier[] = ['free', 'starter', 'pro', 'power'];
  const derivedTier: SubscriptionTier = validTiers.includes(tierString as SubscriptionTier)
    ? (tierString as SubscriptionTier)
    : 'free';

  const currentTier: SubscriptionTier = newTier || derivedTier;
  const tierName = SUBSCRIPTION_TIER_NAMES[currentTier];
  const maxModels = getMaxModelsForTier(currentTier);
  const threadsLimit = usageStats?.data?.threads?.limit || 0;
  const messagesLimit = usageStats?.data?.messages?.limit || 0;

  const formatLimit = (limit: number) => (limit === -1 ? '∞' : limit);

  return (
    <StatusPage
      variant="success"
      title={t('billing.success.title')}
      description={t('billing.success.description')}
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
        <PlanSummaryCard
          tierName={tierName}
          description={t(`subscription.tiers.${currentTier}.description`)}
          status={displaySubscription.status}
          stats={[
            { label: 'Models', value: maxModels },
            { label: 'Threads', value: formatLimit(threadsLimit) },
            { label: 'Messages', value: formatLimit(messagesLimit) },
          ]}
          activeUntil={
            displaySubscription.currentPeriodEnd
              ? new Date(displaySubscription.currentPeriodEnd).toLocaleDateString()
              : undefined
          }
        />
      )}

      <p className="text-xs text-muted-foreground">
        {t('billing.success.autoRedirect', { seconds: countdown })}
      </p>
    </StatusPage>
  );
}
