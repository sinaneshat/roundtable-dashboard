import { PlanTypes, PurchaseTypes, StatusVariants, StripeSubscriptionStatuses, SubscriptionTiers } from '@roundtable/shared';
import { useEffect, useMemo, useRef, useState } from 'react';

import { StatusPage, StatusPageActions } from '@/components/billing';
import { useSyncAfterCheckoutMutation } from '@/hooks/mutations';
import { useSubscriptionsQuery, useUsageStatsQuery } from '@/hooks/queries';
import { useCountdownRedirect } from '@/hooks/utils';
import { useTranslations } from '@/lib/i18n';
import { createStorageHelper } from '@/lib/utils/safe-storage';
import type { SyncAfterCheckoutResponse } from '@/services/api';
import type { Subscription } from '@/services/api/billing/subscriptions';

type ApiResponse<T> = { success: boolean; data?: T };

const syncResultStorage = createStorageHelper<SyncAfterCheckoutResponse>('billing_sync_result', 'session');

export function BillingSuccessClient() {
  const t = useTranslations();

  const syncMutation = useSyncAfterCheckoutMutation();
  const subscriptionsQuery = useSubscriptionsQuery();
  const usageStatsQuery = useUsageStatsQuery();

  const hasInitiatedSync = useRef(false);

  // State to track sync completion - survives remounts via sessionStorage
  const [syncComplete, setSyncComplete] = useState(() => {
    return syncResultStorage.get() !== null;
  });
  const [storedResult, setStoredResult] = useState<SyncAfterCheckoutResponse | null>(() => {
    return syncResultStorage.get();
  });
  const [isLoading, setIsLoading] = useState(!syncResultStorage.get());

  // Enable countdown only when sync is complete (from mutation or storage)
  const { countdown } = useCountdownRedirect({
    enabled: syncComplete,
    redirectPath: '/chat',
    onComplete: syncResultStorage.clear,
  });

  type SubscriptionsResponse = { items?: Subscription[] };
  type UsageStatsResponse = {
    plan?: { type?: string };
  };

  const subscriptionData = subscriptionsQuery.data as ApiResponse<SubscriptionsResponse> | undefined;
  const usageStats = usageStatsQuery.data as ApiResponse<UsageStatsResponse> | undefined;

  // Use stored result
  const syncResult = storedResult;
  const syncedTier = syncResult?.data?.tierChange?.newTier;

  const displaySubscription: Subscription | null = useMemo(() => {
    const items = subscriptionData?.data?.items as Subscription[] | undefined;
    if (!items || items.length === 0)
      return null;
    return (
      items.find(sub => sub.status === StripeSubscriptionStatuses.ACTIVE)
      ?? items[0]
      ?? null
    );
  }, [subscriptionData]);

  // Track sync errors
  const [syncError, setSyncError] = useState(false);

  // Initiate sync on mount using mutation hook for consistent invalidation logic
  // Note: No isMounted check needed - React 18 handles setState on unmounted components gracefully,
  // and removing it fixes StrictMode double-mount issues where the ref persists but isMounted doesn't
  useEffect(() => {
    if (hasInitiatedSync.current || syncComplete)
      return;

    hasInitiatedSync.current = true;

    syncMutation.mutate(undefined, {
      onSuccess: (data) => {
        const result = data as SyncAfterCheckoutResponse;
        syncResultStorage.set(result);
        setStoredResult(result);
        setSyncComplete(true);
        setIsLoading(false);
        // Note: Cache invalidation is handled by the mutation hook's onSuccess
      },
      onError: (error) => {
        console.error('[BillingSuccessClient] Sync failed:', error);
        syncResultStorage.clear();
        setSyncError(true);
        setIsLoading(false);
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check if we have a completed sync (from mutation or storage)
  const isLoadingData = isLoading && !syncComplete;

  if (isLoadingData) {
    return (
      <StatusPage
        variant={StatusVariants.LOADING}
        title={t('billing.success.processingSubscription')}
        description={t('billing.success.confirmingPayment')}
      />
    );
  }

  if (syncError) {
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

  // Check if user already has an active subscription (handles revisit scenario)
  const hasExistingSubscription = displaySubscription?.status === StripeSubscriptionStatuses.ACTIVE;

  if (syncResult?.data?.purchaseType === PurchaseTypes.NONE && !hasExistingSubscription) {
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
    || (syncedTier === undefined && usageStats?.data?.plan?.type === PlanTypes.PAID)
    || hasExistingSubscription;
  const tierName = isPaidPlan ? t('subscription.tiers.pro.name') : t('subscription.tiers.free.name');

  const successTitle = t('billing.success.title');
  const successDescription = t('billing.success.description');

  const activeUntilDate = displaySubscription?.currentPeriodEnd
    ? new Date(displaySubscription.currentPeriodEnd).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
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
      {displaySubscription && isPaidPlan && (
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
