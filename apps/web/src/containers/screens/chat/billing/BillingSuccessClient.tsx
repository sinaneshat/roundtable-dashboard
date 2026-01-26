import { PlanTypes, PurchaseTypes, StatusVariants, StripeSubscriptionStatuses, SubscriptionTiers } from '@roundtable/shared';
import { useEffect, useMemo } from 'react';

import { StatusPage, StatusPageActions } from '@/components/billing';
import { useSyncAfterCheckoutMutation } from '@/hooks/mutations';
import { useSubscriptionsQuery, useUsageStatsQuery } from '@/hooks/queries';
import { useCountdownRedirect } from '@/hooks/utils';
import { useTranslations } from '@/lib/i18n';
import { getSyncedTierChange, getSyncPurchaseType } from '@/services/api/billing/checkout';
import { getSubscriptionsFromResponse } from '@/services/api/billing/subscriptions';
import { getPlanTypeFromUsageStats } from '@/services/api/usage';

export function BillingSuccessClient() {
  const t = useTranslations();

  const syncMutation = useSyncAfterCheckoutMutation();
  const subscriptionsQuery = useSubscriptionsQuery();
  const usageStatsQuery = useUsageStatsQuery();

  // Type-safe extraction using utility functions from service layer
  const subscriptions = getSubscriptionsFromResponse(subscriptionsQuery.data);
  const usageStatsPlanType = getPlanTypeFromUsageStats(usageStatsQuery.data);

  // Derive active subscription from prefetched data (parent loader already fetched)
  const activeSubscription = useMemo(() => {
    return subscriptions.find(sub => sub.status === StripeSubscriptionStatuses.ACTIVE) ?? null;
  }, [subscriptions]);

  // Skip sync if already has active subscription (revisit scenario)
  const alreadyActivated = activeSubscription !== null;

  // Derive all state - no manual tracking needed
  const syncComplete = alreadyActivated || syncMutation.isSuccess;
  const isLoading = syncMutation.isPending && !alreadyActivated;
  const hasError = syncMutation.isError && !alreadyActivated;

  // Single useEffect - only fires if sync actually needed
  useEffect(() => {
    if (alreadyActivated) {
      return;
    }
    if (syncMutation.isPending || syncMutation.isSuccess || syncMutation.isError) {
      return;
    }
    syncMutation.mutate(undefined);
  }, [alreadyActivated, syncMutation]);

  // Countdown starts when sync complete
  const { countdown } = useCountdownRedirect({
    enabled: syncComplete,
    redirectPath: '/chat',
  });

  // Get synced tier from mutation result using type-safe accessor
  const tierChange = getSyncedTierChange(syncMutation.data);
  const syncedTier = tierChange?.newTier;
  const syncPurchaseType = getSyncPurchaseType(syncMutation.data);

  if (isLoading) {
    return (
      <StatusPage
        variant={StatusVariants.LOADING}
        title={t('billing.success.processingSubscription')}
        description={t('billing.success.confirmingPayment')}
      />
    );
  }

  if (hasError) {
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

  // No purchase found (sync returned NONE and no existing subscription)
  if (syncPurchaseType === PurchaseTypes.NONE && !alreadyActivated) {
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

  // Determine if user is on a paid plan - check multiple sources for resilience
  const isPaidPlan = (syncedTier !== undefined && syncedTier !== SubscriptionTiers.FREE)
    || (syncedTier === undefined && usageStatsPlanType === PlanTypes.PAID)
    || alreadyActivated;
  const tierName = isPaidPlan ? t('subscription.tiers.pro.name') : t('subscription.tiers.free.name');

  const successTitle = t('billing.success.title');
  const successDescription = t('billing.success.description');

  const activeUntilDate = activeSubscription?.currentPeriodEnd
    ? new Date(activeSubscription.currentPeriodEnd).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <StatusPage
      variant={StatusVariants.SUCCESS}
      title={successTitle}
      description={successDescription}
      actions={(
        <StatusPageActions
          primaryLabel={t('billing.success.startChat')}
          primaryHref="/chat"
        />
      )}
    >
      {activeSubscription && isPaidPlan && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-green-500 font-medium">
            {tierName}
          </span>
          {activeUntilDate && (
            <>
              <span className="text-muted-foreground/50">•</span>
              <span>
                {t('billing.success.planLimits.activeUntilLabel')}
                {' '}
                {activeUntilDate}
              </span>
            </>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {t('billing.success.autoRedirect', { seconds: countdown })}
      </p>
    </StatusPage>
  );
}
