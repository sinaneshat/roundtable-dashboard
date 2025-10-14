'use client';

import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { getMaxModelsForTier, getTierFromProductId, SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScaleIn, StaggerContainer, StaggerItem } from '@/components/ui/motion';
import { useSyncAfterCheckoutMutation } from '@/hooks/mutations/checkout';
import { useCurrentSubscriptionQuery, useSubscriptionsQuery } from '@/hooks/queries/subscriptions';
import { useUsageStatsQuery } from '@/hooks/queries/usage';

/**
 * Billing Success Client Component - Client-Side Sync Pattern
 *
 * This component handles the post-checkout flow with client-side sync:
 * 1. Initiates sync mutation on mount
 * 2. Shows loading states with progress indicators
 * 3. Fetches subscription data after sync completes
 * 4. Displays subscription details and plan limitations
 *
 * ✅ User sees sync progress in real-time
 * ✅ Clear loading states and error handling
 * ✅ Shows activated subscription with plan details
 * ✅ Displays plan limitations based on tier
 */
export function BillingSuccessClient() {
  const router = useRouter();
  const t = useTranslations();
  const [countdown, setCountdown] = useState(10); // 10 second countdown

  // Sync mutation
  const syncMutation = useSyncAfterCheckoutMutation();

  // Subscription queries - automatically fetch after sync completes
  const { data: subscriptionData } = useSubscriptionsQuery();
  const { data: currentSubscription } = useCurrentSubscriptionQuery();

  // Get usage stats for tier quotas
  const { data: usageStats } = useUsageStatsQuery();

  // Track initialization to prevent double-calls in React.StrictMode
  const hasInitiatedSync = useRef(false);

  // ✅ REACT 19 PATTERN: Derive display subscription during render, no useEffect setState
  // Query data is stable during render, no need to "capture" it in state
  const displaySubscription = currentSubscription || subscriptionData?.data?.subscriptions?.[0] || null;

  // ✅ Initiate sync once on mount (billing success page requires immediate sync)
  // Ref guard prevents double-calls in React.StrictMode
  useEffect(() => {
    if (!hasInitiatedSync.current) {
      syncMutation.mutate(undefined);
      hasInitiatedSync.current = true;
    }
  }, [syncMutation]);

  // Countdown timer for auto-redirect
  useEffect(() => {
    // Only start countdown after sync is complete
    if (!syncMutation.isSuccess)
      return;

    if (countdown <= 0) {
      router.push('/chat');
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, syncMutation.isSuccess, router]);

  // Loading state - syncing
  if (syncMutation.isPending) {
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

  // Error state
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

  // Success state - show subscription details
  // Use centralized tier mapping from ai-config service
  const tierString = displaySubscription?.productId
    ? getTierFromProductId(displaySubscription.productId)
    : 'free';

  // ✅ RUNTIME VALIDATION: Validate tier is a valid SubscriptionTier
  const validTiers: SubscriptionTier[] = ['free', 'starter', 'pro', 'power'];
  const tier: SubscriptionTier = validTiers.includes(tierString as SubscriptionTier)
    ? (tierString as SubscriptionTier)
    : 'free'; // Fallback to free if invalid

  // ✅ SINGLE SOURCE OF TRUTH: Get tier quotas from usage stats (database-driven)
  const tierName = SUBSCRIPTION_TIER_NAMES[tier];
  const maxModels = getMaxModelsForTier(tier);
  const threadsLimit = usageStats?.data?.threads?.limit || 0;
  const messagesLimit = usageStats?.data?.messages?.limit || 0;
  const customRolesLimit = usageStats?.data?.customRoles?.limit || 0;

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

        {displaySubscription && (
          <StaggerItem className="w-full">
            <Card>
              <CardHeader>
                <CardTitle>
                  {tierName}
                  {' '}
                  Plan
                </CardTitle>
                <CardDescription>{t(`subscription.tiers.${tier}.description`)}</CardDescription>
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
                      {/* Memories not in current schema, show as 0 for now */}
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
