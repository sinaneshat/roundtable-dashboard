'use client';

import { AlertCircle, ArrowRight, CheckCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { StripeSubscriptionStatuses } from '@/api/core/enums';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { getMaxModelsForTier, getTierFromProductId, SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScaleIn, StaggerContainer, StaggerItem } from '@/components/ui/motion';
import { useSyncAfterCheckoutMutation } from '@/hooks/mutations/checkout';
import { useCurrentSubscriptionQuery, useSubscriptionsQuery } from '@/hooks/queries/subscriptions';
import { useUsageStatsQuery } from '@/hooks/queries/usage';

export function BillingSuccessClient() {
  const router = useRouter();
  const t = useTranslations();
  const [countdown, setCountdown] = useState(10);
  const [isReady, setIsReady] = useState(false);

  const syncMutation = useSyncAfterCheckoutMutation();

  // Force queries to be enabled on this page (user just completed checkout, they're authenticated)
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

  // Get tier change information from sync mutation response
  const tierChange = syncMutation.data?.data?.tierChange;
  const previousTier = tierChange?.previousTier ?? 'free';
  const newTier = tierChange?.newTier ?? 'free';

  // Initiate sync - only once per component mount
  useEffect(() => {
    if (!hasInitiatedSync.current) {
      syncMutation.mutate(undefined);
      hasInitiatedSync.current = true;
    }
  }, [syncMutation]);

  // Simplified ready state logic - only depends on values actually used
  useEffect(() => {
    // Early return if already ready or sync hasn't succeeded
    if (isReady || !syncMutation.isSuccess) {
      return;
    }

    // Check if both critical queries have fetched AND are not currently refetching
    // isFetched: Query has completed at least once (could be stale server prefetch)
    // !isFetching: Query is not currently fetching (ensures we have fresh data after invalidation)
    const queriesFetched
      = subscriptionsQuery.isFetched && !subscriptionsQuery.isFetching
        && usageStatsQuery.isFetched && !usageStatsQuery.isFetching;

    if (queriesFetched) {
      // Queries have fetched fresh data - mark ready immediately
      // Use queueMicrotask to avoid direct setState in useEffect warning
      queueMicrotask(() => setIsReady(true));
      return;
    }

    // Queries haven't fetched yet or are still fetching - set fallback timeout (max 2 seconds)
    // Clear any existing timeout first
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

  useEffect(() => {
    if (!isReady)
      return;

    if (countdown <= 0) {
      router.replace('/chat');
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, isReady, router]);

  // Show loading while sync is pending OR if we're waiting for data after sync
  const isLoadingData = syncMutation.isPending || (!isReady && !syncMutation.isError);

  if (isLoadingData) {
    return (
      <div className="flex flex-1 w-full flex-col items-center justify-center px-4 py-8">
        <StaggerContainer
          className="flex flex-col items-center gap-6 text-center max-w-md mx-auto"
          staggerDelay={0.15}
          delayChildren={0.1}
        >
          <StaggerItem>
            <ScaleIn duration={0.3} delay={0}>
              <div className="flex size-20 items-center justify-center rounded-full bg-blue-500/10 ring-4 ring-blue-500/20">
                <Loader2 className="size-10 text-blue-500 animate-spin" strokeWidth={2} />
              </div>
            </ScaleIn>
          </StaggerItem>

          <StaggerItem className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {t('billing.success.activatingSubscription')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('billing.success.confirmingPayment')}
            </p>
          </StaggerItem>
        </StaggerContainer>
      </div>
    );
  }

  if (syncMutation.isError) {
    return (
      <div className="flex flex-1 w-full flex-col items-center justify-center px-4 py-8">
        <StaggerContainer
          className="flex flex-col items-center gap-6 text-center max-w-md mx-auto"
          staggerDelay={0.15}
          delayChildren={0.1}
        >
          <StaggerItem>
            <ScaleIn duration={0.3} delay={0}>
              <div className="flex size-20 items-center justify-center rounded-full bg-destructive/10 ring-4 ring-destructive/20">
                <AlertCircle className="size-10 text-destructive" strokeWidth={2} />
              </div>
            </ScaleIn>
          </StaggerItem>

          <StaggerItem className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {t('billing.failure.syncFailed')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('billing.failure.syncFailedDescription')}
            </p>
          </StaggerItem>

          <StaggerItem className="flex flex-col items-center gap-4">
            <Button
              onClick={() => router.replace('/chat')}
              size="lg"
              className="min-w-[200px]"
            >
              {t('actions.goHome')}
            </Button>
          </StaggerItem>
        </StaggerContainer>
      </div>
    );
  }

  // Use newTier from sync response, fallback to deriving from subscription
  const tierString = displaySubscription?.price?.productId
    ? getTierFromProductId(displaySubscription.price.productId)
    : 'free';

  const validTiers: SubscriptionTier[] = ['free', 'starter', 'pro', 'power'];
  const derivedTier: SubscriptionTier = validTiers.includes(tierString as SubscriptionTier)
    ? (tierString as SubscriptionTier)
    : 'free';

  // Prefer newTier from sync response (most accurate), fallback to derived tier
  const currentTier: SubscriptionTier = newTier || derivedTier;

  const tierName = SUBSCRIPTION_TIER_NAMES[currentTier];
  const previousTierName = SUBSCRIPTION_TIER_NAMES[previousTier];
  const maxModels = getMaxModelsForTier(currentTier);
  const previousMaxModels = getMaxModelsForTier(previousTier);
  const threadsLimit = usageStats?.data?.threads?.limit || 0;
  const messagesLimit = usageStats?.data?.messages?.limit || 0;
  const customRolesLimit = usageStats?.data?.customRoles?.limit || 0;

  // Show comparison if tier changed (any upgrade, downgrade, or free->paid)
  const showTierComparison = previousTier !== currentTier;
  const isUpgrade = validTiers.indexOf(currentTier) > validTiers.indexOf(previousTier);
  const isDowngrade = validTiers.indexOf(currentTier) < validTiers.indexOf(previousTier);

  return (
    <div className="flex flex-1 w-full flex-col items-center justify-center px-4 py-8">
      <StaggerContainer
        className="flex flex-col items-center gap-8 text-center max-w-2xl w-full mx-auto"
        staggerDelay={0.15}
        delayChildren={0.1}
      >
        <StaggerItem>
          <ScaleIn duration={0.3} delay={0}>
            <div className="flex size-20 items-center justify-center rounded-full bg-green-500/10 ring-4 ring-green-500/20">
              <CheckCircle className="size-10 text-green-500" strokeWidth={2} />
            </div>
          </ScaleIn>
        </StaggerItem>

        <StaggerItem className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {t('billing.success.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('billing.success.description')}
          </p>
          <div className="pt-2 px-4 py-2 bg-primary/10 rounded-lg border border-primary/20">
            <p className="text-sm font-medium text-primary">
              {t('billing.success.autoRedirect', { seconds: countdown })}
            </p>
          </div>
        </StaggerItem>

        {showTierComparison && (
          <StaggerItem className="w-full">
            <Card className={isUpgrade ? 'border-green-500/20 bg-green-500/5' : isDowngrade ? 'border-blue-500/20 bg-blue-500/5' : 'border-primary/20 bg-primary/5'}>
              <CardHeader>
                <CardTitle className={`flex items-center gap-2 ${isUpgrade ? 'text-green-600' : isDowngrade ? 'text-blue-600' : 'text-primary'}`}>
                  <CheckCircle className="size-5" />
                  {isUpgrade ? 'Upgraded Successfully' : isDowngrade ? 'Changed Successfully' : 'Subscription Updated'}
                </CardTitle>
                <CardDescription>
                  {isUpgrade && `You've upgraded from ${previousTierName} to ${tierName} plan`}
                  {isDowngrade && `You've changed from ${previousTierName} to ${tierName} plan`}
                  {!isUpgrade && !isDowngrade && `Your subscription has been updated to ${tierName} plan`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center gap-4 py-4">
                  <div className="text-center space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Previous</p>
                    <div className="px-4 py-2 rounded-lg bg-muted">
                      <p className="text-lg font-bold">{previousTierName}</p>
                      <p className="text-xs text-muted-foreground">
                        {previousMaxModels}
                        {' '}
                        {previousMaxModels === 1 ? 'model' : 'models'}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className={`size-6 ${isUpgrade ? 'text-green-600' : isDowngrade ? 'text-blue-600' : 'text-primary'}`} />
                  <div className="text-center space-y-2">
                    <p className={`text-sm font-medium ${isUpgrade ? 'text-green-600' : isDowngrade ? 'text-blue-600' : 'text-primary'}`}>Current</p>
                    <div className={isUpgrade ? 'px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/20' : isDowngrade ? 'px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20' : 'px-4 py-2 rounded-lg bg-primary/10 border border-primary/20'}>
                      <p className={`text-lg font-bold ${isUpgrade ? 'text-green-600' : isDowngrade ? 'text-blue-600' : 'text-primary'}`}>{tierName}</p>
                      <p className={`text-xs ${isUpgrade ? 'text-green-600/80' : isDowngrade ? 'text-blue-600/80' : 'text-primary/80'}`}>
                        {maxModels}
                        {' '}
                        {maxModels === 1 ? 'model' : 'models'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
        )}

        {displaySubscription && (
          <StaggerItem className="w-full">
            <Card>
              <CardHeader>
                <CardTitle>
                  {tierName}
                  {' '}
                  Plan
                </CardTitle>
                <CardDescription>{t(`subscription.tiers.${currentTier}.description`)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 text-left">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t('billing.success.planLimits.concurrentModels')}</p>
                    <p className="text-2xl font-bold text-primary">{maxModels}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t('billing.success.planLimits.maxThreads')}</p>
                    <p className="text-2xl font-bold text-primary">
                      {threadsLimit === -1 ? 'Unlimited' : threadsLimit.toLocaleString()}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t('billing.success.planLimits.maxMessages')}</p>
                    <p className="text-2xl font-bold text-primary">
                      {messagesLimit === -1 ? 'Unlimited' : messagesLimit.toLocaleString()}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t('billing.success.planLimits.maxMemories')}</p>
                    <p className="text-2xl font-bold text-primary">
                      {}
                      0
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t('billing.success.planLimits.customRoles')}</p>
                    <p className="text-2xl font-bold text-primary">
                      {customRolesLimit === -1 ? 'Unlimited' : customRolesLimit.toLocaleString()}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t('billing.success.planLimits.status')}</p>
                    <p className="text-sm font-semibold text-green-600 capitalize">
                      {displaySubscription.status}
                    </p>
                  </div>
                </div>

                {displaySubscription.currentPeriodEnd && (
                  <div className="pt-4 border-t text-left">
                    <p className="text-xs text-muted-foreground">
                      {t('billing.success.planLimits.activeUntilLabel')}
                      :
                      {' '}
                      {new Date(displaySubscription.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </StaggerItem>
        )}

        <StaggerItem className="flex flex-col items-center gap-4">
          <Button
            onClick={() => router.replace('/chat')}
            size="lg"
            className="min-w-[200px]"
          >
            {t('billing.success.startChat')}
          </Button>
          <Button
            onClick={() => router.replace('/chat/pricing')}
            variant="outline"
            size="lg"
            className="min-w-[200px]"
          >
            {t('billing.success.viewPricing')}
          </Button>
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}
