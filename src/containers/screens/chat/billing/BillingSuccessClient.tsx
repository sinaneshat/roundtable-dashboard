'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';

import { PlanTypes, PurchaseTypes, StatusVariants, StripeSubscriptionStatuses, SubscriptionTiers } from '@/api/core/enums';
import type { Subscription } from '@/api/routes/billing/schema';
// Direct import to avoid barrel export pulling in server-only credit.service.ts
import { getMaxModelsForTier, getMonthlyCreditsForTier } from '@/api/services/billing/product-logic.service';
import { PlanOverviewCard, StatusPage, StatusPageActions } from '@/components/billing';
import { useSyncAfterCheckoutMutation } from '@/hooks/mutations';
import { useSubscriptionsQuery, useUsageStatsQuery } from '@/hooks/queries';
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

  const subscriptionsQuery = useSubscriptionsQuery();
  const usageStatsQuery = useUsageStatsQuery({ forceEnabled: true });

  const hasInitiatedSync = useRef(false);
  const readyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const subscriptionData = subscriptionsQuery.data;
  const usageStats = usageStatsQuery.data;

  const syncResult = syncMutation.data;
  const syncedCreditsBalance = syncResult?.data?.creditsBalance;
  const syncedTier = syncResult?.data?.tierChange?.newTier;

  const displaySubscription = useMemo((): Subscription | null => {
    return (
      subscriptionData?.data?.items?.find(sub => sub.status === StripeSubscriptionStatuses.ACTIVE)
      ?? subscriptionData?.data?.items?.[0]
      ?? null
    );
  }, [subscriptionData]);

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
        variant={StatusVariants.LOADING}
        title={t('billing.success.processingSubscription')}
        description={t('billing.success.confirmingPayment')}
      />
    );
  }

  if (syncMutation.isError) {
    return (
      <StatusPage
        variant={StatusVariants.ERROR}
        title={t('billing.failure.syncFailed')}
        description={t('billing.failure.syncFailedDescription')}
        actions={(
          <StatusPageActions
            primaryLabel={t('actions.goHome')}
            primaryHref="/chat"
          />
        )}
      />
    );
  }

  if (syncResult?.data?.purchaseType === PurchaseTypes.NONE) {
    return (
      <StatusPage
        variant={StatusVariants.ERROR}
        title={t('billing.failure.noPurchaseFound')}
        description={t('billing.failure.noPurchaseFoundDescription')}
        actions={(
          <StatusPageActions
            primaryLabel={t('billing.success.viewPricing')}
            primaryHref="/chat/pricing"
          />
        )}
      />
    );
  }

  const isPaidPlan = (syncedTier !== undefined && syncedTier !== SubscriptionTiers.FREE) || (syncedTier === undefined && usageStats?.data?.plan?.type === PlanTypes.PAID);
  const currentTier = isPaidPlan ? SubscriptionTiers.PRO : SubscriptionTiers.FREE;
  const tierName = isPaidPlan ? t('subscription.tiers.pro.name') : t('subscription.tiers.free.name');
  const maxModels = getMaxModelsForTier(currentTier);
  const creditsBalance = syncedCreditsBalance ?? usageStats?.data?.credits?.available ?? 0;
  const monthlyCredits = getMonthlyCreditsForTier(currentTier);

  const formatCredits = (credits: number) => credits.toLocaleString();

  const successTitle = t('billing.success.title');
  const successDescription = t('billing.success.description');

  return (
    <StatusPage
      variant={StatusVariants.SUCCESS}
      title={successTitle}
      description={successDescription}
      actions={(
        <StatusPageActions
          primaryLabel={t('billing.success.startChat')}
          primaryHref="/chat"
          secondaryLabel={t('billing.success.viewPricing')}
          secondaryHref="/chat/pricing"
        />
      )}
    >
      {displaySubscription && (
        <PlanOverviewCard
          tierName={tierName}
          description={isPaidPlan
            ? t('billing.success.planLimits.paidDescription')
            : t('billing.success.planLimits.defaultDescription')}
          status={displaySubscription.status}
          stats={[
            { label: t('billing.success.planLimits.models'), value: maxModels },
            { label: t('billing.success.planLimits.credits'), value: formatCredits(creditsBalance) },
            {
              label: isPaidPlan ? t('billing.success.planLimits.monthly') : t('billing.success.planLimits.bonus'),
              value: isPaidPlan ? formatCredits(monthlyCredits) : t('billing.success.planLimits.oneTime'),
            },
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
