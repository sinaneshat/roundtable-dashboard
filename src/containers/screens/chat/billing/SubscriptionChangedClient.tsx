'use client';

import { AlertCircle, ArrowDown, ArrowUp, CheckCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

import type { SubscriptionChangeType, SubscriptionTier } from '@/api/core/enums';
import { StripeSubscriptionStatuses, SubscriptionChangeTypes, SubscriptionChangeTypeSchema } from '@/api/core/enums';
import type { Subscription } from '@/api/routes/billing/schema';
import { getMaxModelsForTier, getMonthlyCreditsForTier, getTierFromProductId, SUBSCRIPTION_TIER_NAMES, subscriptionTierSchema } from '@/api/services/product-logic.service';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScaleIn, StaggerContainer, StaggerItem } from '@/components/ui/motion';
import { useSubscriptionsQuery, useUsageStatsQuery } from '@/hooks/queries';
import { useCountdownRedirect } from '@/hooks/utils';

function ChangeBadge({ changeType, t }: {
  changeType: SubscriptionChangeType;
  t: ReturnType<typeof useTranslations>;
}) {
  if (changeType === SubscriptionChangeTypes.UPGRADE) {
    return (
      <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20">
        <ArrowUp className="mr-1 size-3" />
        {t('billing.subscriptionChanged.upgrade')}
      </Badge>
    );
  }

  if (changeType === SubscriptionChangeTypes.DOWNGRADE) {
    return (
      <Badge className="bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 border-orange-500/20">
        <ArrowDown className="mr-1 size-3" />
        {t('billing.subscriptionChanged.downgrade')}
      </Badge>
    );
  }

  return (
    <Badge variant="outline">
      {t('billing.subscriptionChanged.change')}
    </Badge>
  );
}

/**
 * Internal component that uses useSearchParams
 * Separated to allow Suspense wrapping per Next.js 15 requirements
 */
function SubscriptionChangedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations();

  // ✅ TYPE-SAFE: Use Zod schema validation instead of unsafe cast
  const changeTypeRaw = searchParams.get('changeType');
  const changeTypeResult = SubscriptionChangeTypeSchema.safeParse(changeTypeRaw);
  const changeType = changeTypeResult.success ? changeTypeResult.data : null;
  const oldProductId = searchParams.get('oldProductId');

  const { data: subscriptionData, isFetching: isSubscriptionsFetching } = useSubscriptionsQuery();

  const { data: usageStats, isFetching: isUsageStatsFetching } = useUsageStatsQuery();

  const displaySubscription
    = subscriptionData?.data?.items?.find((sub: Subscription) => sub.status === StripeSubscriptionStatuses.ACTIVE)
      || subscriptionData?.data?.items?.[0]
      || null;

  const isLoadingData = isSubscriptionsFetching || isUsageStatsFetching;

  // ✅ React 19: Timer-based redirect extracted to shared hook
  const { countdown } = useCountdownRedirect({
    enabled: !isLoadingData,
    redirectPath: '/chat',
  });

  if (!isLoadingData && !displaySubscription) {
    return (
      <div className="flex flex-1 w-full flex-col items-center justify-center px-4 py-8">
        <StaggerContainer
          className="flex flex-col items-center gap-6 text-center max-w-md mx-auto"
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
              {t('billing.subscriptionChanged.noSubscriptionFound')}
            </h1>
            <p className="text-sm text-muted-foreground md:text-base">
              {t('billing.subscriptionChanged.noSubscriptionFoundDescription')}
            </p>
          </StaggerItem>

          <StaggerItem className="flex flex-col items-center gap-4">
            <Button
              onClick={() => router.replace('/chat/pricing')}
              size="lg"
              className="min-w-[200px]"
            >
              {t('billing.subscriptionChanged.viewPricing')}
            </Button>
          </StaggerItem>
        </StaggerContainer>
      </div>
    );
  }

  // ✅ TYPE-SAFE: Use Zod schema validation instead of unsafe casts
  const newTierString = displaySubscription?.price?.productId
    ? getTierFromProductId(displaySubscription.price.productId)
    : 'free';

  const newTierResult = subscriptionTierSchema.safeParse(newTierString);
  const newTier: SubscriptionTier = newTierResult.success ? newTierResult.data : 'free';

  const oldTierString = oldProductId ? getTierFromProductId(oldProductId) : null;
  const oldTierResult = oldTierString ? subscriptionTierSchema.safeParse(oldTierString) : null;
  const oldTier: SubscriptionTier | null = oldTierResult?.success ? oldTierResult.data : null;

  const isUpgrade = changeType === SubscriptionChangeTypes.UPGRADE;
  const isDowngrade = changeType === SubscriptionChangeTypes.DOWNGRADE;

  const currentActiveTier = isDowngrade ? oldTier : newTier;
  const futureTier = isDowngrade ? newTier : null;

  const newTierName = SUBSCRIPTION_TIER_NAMES[newTier];
  const oldTierName = oldTier ? SUBSCRIPTION_TIER_NAMES[oldTier] : null;
  const currentActiveTierName = currentActiveTier ? SUBSCRIPTION_TIER_NAMES[currentActiveTier] : newTierName;
  const futureTierName = futureTier ? SUBSCRIPTION_TIER_NAMES[futureTier] : null;

  const newMaxModels = getMaxModelsForTier(newTier);
  const oldMaxModels = oldTier ? getMaxModelsForTier(oldTier) : null;
  const currentActiveMaxModels = currentActiveTier ? getMaxModelsForTier(currentActiveTier) : newMaxModels;
  const futureMaxModels = futureTier ? getMaxModelsForTier(futureTier) : null;

  // ✅ TIER-BASED: Get monthly credits from tier configuration, not user stats
  const newMonthlyCredits = getMonthlyCreditsForTier(newTier);
  const oldMonthlyCredits = oldTier ? getMonthlyCreditsForTier(oldTier) : null;
  const currentActiveMonthlyCredits = currentActiveTier ? getMonthlyCreditsForTier(currentActiveTier) : newMonthlyCredits;
  const futureMonthlyCredits = futureTier ? getMonthlyCreditsForTier(futureTier) : null;

  // ✅ CREDITS: Current user balance from usage stats
  const creditsAvailable = usageStats?.data?.credits?.available || 0;

  const effectiveDate = displaySubscription?.currentPeriodEnd
    ? new Date(displaySubscription.currentPeriodEnd).toLocaleDateString()
    : null;

  return (
    <div className="flex flex-1 w-full flex-col items-center justify-center px-4 py-8">
      <StaggerContainer
        className="flex flex-col items-center gap-8 text-center max-w-2xl w-full mx-auto"
        staggerDelay={0.15}
        delayChildren={0.1}
      >
        <StaggerItem>
          <ScaleIn duration={0.3} delay={0}>
            <div className="flex size-20 items-center mx-auto justify-center rounded-full bg-green-500/10 ring-4 ring-green-500/20 md:size-24">
              <CheckCircle className="size-10 text-green-500 mx-auto md:size-12" strokeWidth={2} />
            </div>
          </ScaleIn>
        </StaggerItem>

        <StaggerItem className="space-y-3">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              {t('billing.subscriptionChanged.title')}
            </h1>
            {changeType && <ChangeBadge changeType={changeType} t={t} />}
          </div>
          <p className="text-sm text-muted-foreground md:text-base">
            {isUpgrade
              ? t('billing.subscriptionChanged.upgradeDescription')
              : isDowngrade
                ? t('billing.subscriptionChanged.downgradeDescription')
                : t('billing.subscriptionChanged.changeDescription')}
          </p>

          {isDowngrade && effectiveDate && (
            <div className="pt-2 px-4 py-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <p className="text-sm font-medium text-blue-600">
                {t('billing.subscriptionChanged.gracePeriodNotice', { date: effectiveDate })}
              </p>
            </div>
          )}

          <div className="pt-2 px-4 py-2 bg-primary/10 rounded-lg border border-primary/20">
            <p className="text-sm font-medium text-primary">
              {t('billing.success.autoRedirect', { seconds: countdown })}
            </p>
          </div>
        </StaggerItem>

        {oldTier && oldTierName && (
          <StaggerItem className="w-full">
            {isDowngrade
              ? (

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-primary/50 bg-primary/5">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">
                            {t('billing.subscriptionChanged.currentPlanNow')}
                          </CardTitle>
                        </div>
                        <CardDescription className="text-primary">
                          {currentActiveTierName}
                          {' '}
                          Plan
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('billing.success.planLimits.concurrentModels')}
                          </p>
                          <p className="text-xl font-bold text-primary">{currentActiveMaxModels}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('billing.success.planLimits.monthlyCredits')}
                          </p>
                          <p className="text-xl font-bold text-primary">
                            {currentActiveMonthlyCredits > 0 ? currentActiveMonthlyCredits.toLocaleString() : t('common.none')}
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-muted">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">
                            {t('billing.subscriptionChanged.afterDate', { date: effectiveDate || 'billing period ends' })}
                          </CardTitle>
                        </div>
                        <CardDescription className="text-muted-foreground/70">
                          {futureTierName}
                          {' '}
                          Plan
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('billing.success.planLimits.concurrentModels')}
                          </p>
                          <p className="text-xl font-bold">{futureMaxModels}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('billing.success.planLimits.monthlyCredits')}
                          </p>
                          <p className="text-xl font-bold">
                            {futureMonthlyCredits !== null && futureMonthlyCredits > 0 ? futureMonthlyCredits.toLocaleString() : t('common.none')}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )
              : (

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-muted">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">
                            {t('billing.subscriptionChanged.previousPlan')}
                          </CardTitle>
                        </div>
                        <CardDescription className="text-muted-foreground/70">
                          {oldTierName}
                          {' '}
                          Plan
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('billing.success.planLimits.concurrentModels')}
                          </p>
                          <p className="text-xl font-bold">{oldMaxModels}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('billing.success.planLimits.monthlyCredits')}
                          </p>
                          <p className="text-xl font-bold">
                            {oldMonthlyCredits !== null && oldMonthlyCredits > 0 ? oldMonthlyCredits.toLocaleString() : t('common.none')}
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-primary/50 bg-primary/5">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">
                            {t('billing.subscriptionChanged.currentPlan')}
                          </CardTitle>
                        </div>
                        <CardDescription className="text-primary">
                          {newTierName}
                          {' '}
                          Plan
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('billing.success.planLimits.concurrentModels')}
                          </p>
                          <p className="text-xl font-bold text-primary">{newMaxModels}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('billing.success.planLimits.monthlyCredits')}
                          </p>
                          <p className="text-xl font-bold text-primary">
                            {newMonthlyCredits > 0 ? newMonthlyCredits.toLocaleString() : t('common.none')}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
          </StaggerItem>
        )}

        {}
        {displaySubscription && (
          <StaggerItem className="w-full">
            <Card>
              <CardHeader>
                <CardTitle>
                  {oldTier ? t('billing.subscriptionChanged.newPlanDetails') : newTierName}
                  {!oldTier && ' Plan'}
                </CardTitle>
                <CardDescription>{t(`subscription.tiers.${newTier}.description`)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t('billing.success.planLimits.concurrentModels')}</p>
                    <p className="text-2xl font-bold text-primary">{newMaxModels}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t('billing.success.planLimits.creditsAvailable')}</p>
                    <p className="text-2xl font-bold text-primary">
                      {creditsAvailable.toLocaleString()}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t('billing.success.planLimits.monthlyCredits')}</p>
                    <p className="text-2xl font-bold text-primary">
                      {newMonthlyCredits > 0 ? newMonthlyCredits.toLocaleString() : t('common.none')}
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

/**
 * Subscription Changed Client wrapper component with Suspense boundary
 * Following Next.js 15 pattern for useSearchParams usage
 */
export function SubscriptionChangedClient() {
  return (
    <Suspense
      fallback={(
        <div className="flex flex-1 w-full flex-col items-center justify-center px-4 py-8">
          <div className="flex flex-col items-center gap-6 text-center max-w-md mx-auto">
            <div className="flex size-20 items-center justify-center rounded-full bg-primary/10 ring-4 ring-primary/20 md:size-24">
              <CheckCircle className="size-10 text-primary md:size-12 animate-pulse" strokeWidth={2} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              Loading...
            </h1>
          </div>
        </div>
      )}
    >
      <SubscriptionChangedContent />
    </Suspense>
  );
}
