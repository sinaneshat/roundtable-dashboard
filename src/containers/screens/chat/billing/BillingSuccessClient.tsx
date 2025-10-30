'use client';

import { AlertCircle, ArrowRight, CheckCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

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
  const currentSubscriptionQuery = useCurrentSubscriptionQuery();
  const usageStatsQuery = useUsageStatsQuery({ forceEnabled: true });

  const hasInitiatedSync = useRef(false);

  const subscriptionData = subscriptionsQuery.data;
  const currentSubscription = currentSubscriptionQuery.data;
  const usageStats = usageStatsQuery.data;

  const displaySubscription
    = currentSubscription?.data?.items?.find(sub => sub.status === 'active')
      || currentSubscription?.data?.items?.[0]
      || subscriptionData?.data?.items?.[0]
      || null;

  // Capture previous tier on first render (before sync completes)
  // useMemo runs during render but only once with empty deps
  const previousTier = useMemo<SubscriptionTier | null>(() => {
    return (usageStats?.data?.subscription?.tier as SubscriptionTier) || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only capture initial value
  }, []);

  // Initiate sync
  useEffect(() => {
    if (!hasInitiatedSync.current) {
      syncMutation.mutate(undefined);
      hasInitiatedSync.current = true;
    }
  }, [syncMutation]);

  // Mark as ready when sync completes and queries have fetched data (or after timeout)
  useEffect(() => {
    if (!syncMutation.isSuccess || isReady) {
      return;
    }

    // Check if queries have fetched (regardless of whether they have data)
    const queriesFetched = subscriptionsQuery.isFetched && usageStatsQuery.isFetched;

    // If queries have fetched, immediately mark as ready
    if (queriesFetched) {
      // Use queueMicrotask to defer setState to avoid synchronous updates in effect
      queueMicrotask(() => setIsReady(true));
      return;
    }

    // Otherwise, force ready after 1 second
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    syncMutation.isSuccess,
    subscriptionsQuery.isFetched,
    subscriptionsQuery.isSuccess,
    usageStatsQuery.isFetched,
    usageStatsQuery.isSuccess,
    isReady,
  ]);

  useEffect(() => {
    if (!isReady)
      return;

    if (countdown <= 0) {
      router.push('/chat');
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
      <div className="flex min-h-screen w-full flex-col items-center justify-start px-4 pt-16 md:pt-20">
        <StaggerContainer
          className="flex flex-col items-center gap-6 text-center max-w-md"
          staggerDelay={0.15}
          delayChildren={0.1}
        >
          <StaggerItem>
            <ScaleIn duration={0.3} delay={0}>
              <div className="flex size-20 items-center justify-center rounded-full bg-blue-500/10 ring-4 ring-blue-500/20 md:size-24">
                <Loader2 className="size-10 text-blue-500 md:size-12 animate-spin" strokeWidth={2} />
              </div>
            </ScaleIn>
          </StaggerItem>

          <StaggerItem className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              {t('billing.success.activatingSubscription')}
            </h1>
            <p className="text-sm text-muted-foreground md:text-base">
              {t('billing.success.confirmingPayment')}
            </p>
          </StaggerItem>
        </StaggerContainer>
      </div>
    );
  }

  if (syncMutation.isError) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-start px-4 pt-16 md:pt-20">
        <StaggerContainer
          className="flex flex-col items-center gap-6 text-center max-w-md"
          staggerDelay={0.15}
          delayChildren={0.1}
        >
          <StaggerItem>
            <ScaleIn duration={0.3} delay={0}>
              <div className="flex size-20 items-center justify-center rounded-full bg-destructive/10 ring-4 ring-destructive/20 md:size-24">
                <AlertCircle className="size-10 text-destructive md:size-12" strokeWidth={2} />
              </div>
            </ScaleIn>
          </StaggerItem>

          <StaggerItem className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              {t('billing.failure.syncFailed')}
            </h1>
            <p className="text-sm text-muted-foreground md:text-base">
              {t('billing.failure.syncFailedDescription')}
            </p>
          </StaggerItem>

          <StaggerItem className="flex flex-col items-center gap-4">
            <Button
              onClick={() => router.push('/chat')}
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

  const tierString = displaySubscription?.price?.productId
    ? getTierFromProductId(displaySubscription.price.productId)
    : 'free';

  const validTiers: SubscriptionTier[] = ['free', 'starter', 'pro', 'power'];
  const currentTier: SubscriptionTier = validTiers.includes(tierString as SubscriptionTier)
    ? (tierString as SubscriptionTier)
    : 'free';

  const tierName = SUBSCRIPTION_TIER_NAMES[currentTier];
  const maxModels = getMaxModelsForTier(currentTier);
  const threadsLimit = usageStats?.data?.threads?.limit || 0;
  const messagesLimit = usageStats?.data?.messages?.limit || 0;
  const customRolesLimit = usageStats?.data?.customRoles?.limit || 0;

  // Show upgrade comparison if user upgraded from free tier
  const showUpgradeComparison = previousTier === 'free' && currentTier !== 'free';

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-start px-4 pt-16 md:pt-20">
      <StaggerContainer
        className="flex flex-col items-center gap-8 text-center max-w-2xl w-full"
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

        <StaggerItem className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {t('billing.success.title')}
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            {t('billing.success.description')}
          </p>
          <div className="pt-2 px-4 py-2 bg-primary/10 rounded-lg border border-primary/20">
            <p className="text-sm font-medium text-primary">
              {t('billing.success.autoRedirect', { seconds: countdown })}
            </p>
          </div>
        </StaggerItem>

        {showUpgradeComparison && (
          <StaggerItem className="w-full">
            <Card className="border-green-500/20 bg-green-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="size-5" />
                  Upgraded Successfully
                </CardTitle>
                <CardDescription>
                  You've upgraded from Free to
                  {' '}
                  {tierName}
                  {' '}
                  plan
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center gap-4 py-4">
                  <div className="text-center space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Previous</p>
                    <div className="px-4 py-2 rounded-lg bg-muted">
                      <p className="text-lg font-bold">Free</p>
                      <p className="text-xs text-muted-foreground">
                        {getMaxModelsForTier('free')}
                        {' '}
                        models
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="size-6 text-green-600" />
                  <div className="text-center space-y-2">
                    <p className="text-sm font-medium text-green-600">Current</p>
                    <div className="px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
                      <p className="text-lg font-bold text-green-600">{tierName}</p>
                      <p className="text-xs text-green-600/80">
                        {maxModels}
                        {' '}
                        models
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
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

        <StaggerItem className="flex flex-col sm:flex-row items-center gap-4">
          <Button
            onClick={() => router.push('/chat')}
            size="lg"
            className="min-w-[200px]"
          >
            {t('billing.success.startChat')}
          </Button>
          <Button
            onClick={() => router.push('/chat/pricing')}
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
