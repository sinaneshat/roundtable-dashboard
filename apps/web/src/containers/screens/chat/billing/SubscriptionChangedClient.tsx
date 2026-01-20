import type { SubscriptionChangeType, SubscriptionTier } from '@roundtable/shared';
import { StripeSubscriptionStatuses, SubscriptionChangeTypes, SubscriptionChangeTypeSchema, SubscriptionTiers, SubscriptionTierSchema } from '@roundtable/shared';
import { getRouteApi, Link } from '@tanstack/react-router';
import { Suspense, useMemo } from 'react';

import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScaleIn, StaggerContainer, StaggerItem } from '@/components/ui/motion';
import { useSubscriptionsQuery, useUsageStatsQuery } from '@/hooks/queries';
import { useCountdownRedirect } from '@/hooks/utils';
import { SUBSCRIPTION_TIER_NAMES } from '@/lib/config';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';
import { getMaxModelsForTier, getMonthlyCreditsForTier, getTierFromProductId } from '@/lib/utils/product-logic';
import { validateUsageStatsCache } from '@/stores/chat/actions/types';
import type { Subscription } from '@/types/billing';

// Glass button styles for billing pages (consistent with chat toolbar)
const glassButtonPrimary = 'h-11 rounded-xl bg-white text-black font-medium hover:bg-white/90 transition-colors';
const glassButtonSecondary = 'h-11 rounded-xl border-white/20 bg-white/10 text-foreground hover:bg-white/15 hover:border-white/30 transition-colors';

type ChangeBadgeProps = {
  changeType: SubscriptionChangeType;
  t: (key: string, values?: Record<string, string | number>) => string;
};

function ChangeBadge(props: ChangeBadgeProps) {
  const { changeType, t } = props;
  if (changeType === SubscriptionChangeTypes.UPGRADE) {
    return (
      <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20">
        <Icons.arrowUp className="mr-1 size-3" />
        {t('billing.subscriptionChanged.upgrade')}
      </Badge>
    );
  }

  if (changeType === SubscriptionChangeTypes.DOWNGRADE) {
    return (
      <Badge className="bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 border-orange-500/20">
        <Icons.arrowDown className="mr-1 size-3" />
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

const routeApi = getRouteApi('/_protected/chat/billing/subscription-changed');

function SubscriptionChangedContent() {
  const searchParams = routeApi.useSearch();
  const t = useTranslations();

  const changeTypeRaw = searchParams.changeType;
  const changeTypeResult = SubscriptionChangeTypeSchema.safeParse(changeTypeRaw);
  const changeType = changeTypeResult.success ? changeTypeResult.data : null;
  const oldProductId = searchParams.oldProductId;

  const { data: subscriptionData, isFetching: isSubscriptionsFetching } = useSubscriptionsQuery();
  const { data: usageStats, isFetching: isUsageStatsFetching } = useUsageStatsQuery();

  type SubscriptionsApiResponse = { success: boolean; data?: { items?: Subscription[] } };

  const displaySubscription: Subscription | null = useMemo(() => {
    if (!subscriptionData) {
      return null;
    }
    const data = subscriptionData as SubscriptionsApiResponse;
    if (!data.data?.items || data.data.items.length === 0) {
      return null;
    }
    const items = data.data.items as Subscription[];
    return items.find(sub => sub.status === StripeSubscriptionStatuses.ACTIVE) ?? items[0] ?? null;
  }, [subscriptionData]);

  const isLoadingData = isSubscriptionsFetching || isUsageStatsFetching;

  const { countdown } = useCountdownRedirect({
    enabled: !isLoadingData,
    redirectPath: '/chat',
  });

  // Must be called before early return to satisfy React hooks rules
  const creditsAvailable = useMemo(() => {
    const validated = validateUsageStatsCache(usageStats);
    return validated?.credits.available ?? 0;
  }, [usageStats]);

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
                <Icons.alertCircle className="size-10 text-destructive md:size-12" strokeWidth={2} />
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
              asChild
              size="lg"
              className={cn('min-w-[200px]', glassButtonPrimary)}
            >
              <Link to="/chat/pricing">
                {t('billing.subscriptionChanged.viewPricing')}
              </Link>
            </Button>
          </StaggerItem>
        </StaggerContainer>
      </div>
    );
  }

  const priceProductId = (displaySubscription as Subscription & { price?: { productId?: string } })?.price?.productId;
  const newTierString = priceProductId
    ? getTierFromProductId(priceProductId)
    : SubscriptionTiers.FREE;

  const newTierResult = SubscriptionTierSchema.safeParse(newTierString);
  const newTier: SubscriptionTier = newTierResult.success ? newTierResult.data : SubscriptionTiers.FREE;

  const oldTierString = oldProductId ? getTierFromProductId(oldProductId) : null;
  const oldTierResult = oldTierString ? SubscriptionTierSchema.safeParse(oldTierString) : null;
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

  const newMonthlyCredits = getMonthlyCreditsForTier(newTier);
  const oldMonthlyCredits = oldTier ? getMonthlyCreditsForTier(oldTier) : null;
  const currentActiveMonthlyCredits = currentActiveTier ? getMonthlyCreditsForTier(currentActiveTier) : newMonthlyCredits;
  const futureMonthlyCredits = futureTier ? getMonthlyCreditsForTier(futureTier) : null;

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
              <Icons.checkCircle className="size-10 text-green-500 mx-auto md:size-12" strokeWidth={2} />
            </div>
          </ScaleIn>
        </StaggerItem>

        <StaggerItem className="space-y-3">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              {t('billing.subscriptionChanged.title')}
            </h1>
            {changeType && <ChangeBadge changeType={changeType} t={t as (key: string, values?: Record<string, string | number>) => string} />}
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
                          {t('subscription.planLabel')}
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
                            {t('billing.subscriptionChanged.afterDate', {
                              date: effectiveDate || t('billing.subscriptionChanged.billingPeriodEnds'),
                            })}
                          </CardTitle>
                        </div>
                        <CardDescription className="text-muted-foreground/70">
                          {futureTierName}
                          {' '}
                          {t('subscription.planLabel')}
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
                          {t('subscription.planLabel')}
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
                          {t('subscription.planLabel')}
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

        {displaySubscription && (
          <StaggerItem className="w-full">
            <Card>
              <CardHeader>
                <CardTitle>
                  {oldTier
                    ? t('billing.subscriptionChanged.newPlanDetails')
                    : `${newTierName} ${t('subscription.planLabel')}`}
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
            asChild
            size="lg"
            className={cn('min-w-[200px]', glassButtonPrimary)}
          >
            <Link to="/chat">
              {t('billing.success.startChat')}
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className={cn('min-w-[200px]', glassButtonSecondary)}
          >
            <Link to="/chat/pricing">
              {t('billing.success.viewPricing')}
            </Link>
          </Button>
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}

function SubscriptionChangedFallback() {
  const t = useTranslations();
  return (
    <div className="flex flex-1 w-full flex-col items-center justify-center px-4 py-8">
      <div className="flex flex-col items-center gap-6 text-center max-w-md mx-auto">
        <div className="flex size-20 items-center justify-center rounded-full bg-primary/10 ring-4 ring-primary/20 md:size-24">
          <Icons.checkCircle className="size-10 text-primary md:size-12 animate-pulse" strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          {t('common.loading')}
        </h1>
      </div>
    </div>
  );
}

export function SubscriptionChangedClient() {
  return (
    <Suspense fallback={<SubscriptionChangedFallback />}>
      <SubscriptionChangedContent />
    </Suspense>
  );
}
