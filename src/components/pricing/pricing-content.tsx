'use client';

import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { UIBillingInterval } from '@/api/core/enums';
import {
  DEFAULT_UI_BILLING_INTERVAL,
  isUIBillingInterval,
  StripeSubscriptionStatuses,
  UIBillingIntervals,
} from '@/api/core/enums';
import type { Price, Product, Subscription } from '@/api/routes/billing/schema';
import { Icons } from '@/components/icons';
import { PricingContentSkeleton } from '@/components/pricing/pricing-content-skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PricingCard } from '@/components/ui/pricing-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMounted } from '@/hooks/utils';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';

const CREDITS_TAB = 'credits' as const;
type PricingTab = UIBillingInterval | typeof CREDITS_TAB;

function isPricingTab(value: string): value is PricingTab {
  return isUIBillingInterval(value) || value === CREDITS_TAB;
}

type CreditPackagePriceId = keyof typeof CREDIT_CONFIG.CUSTOM_CREDITS.packages;

function isCreditPackagePriceId(priceId: string): priceId is CreditPackagePriceId {
  return priceId in CREDIT_CONFIG.CUSTOM_CREDITS.packages;
}

type PricingContentProps = {
  products: Product[];
  subscriptions: Subscription[];
  isLoading?: boolean;
  error?: Error | null;
  processingPriceId: string | null;
  cancelingSubscriptionId?: string | null;
  isManagingBilling?: boolean;
  onSubscribe: (priceId: string) => void | Promise<void>;
  onCancel: (subscriptionId: string) => void | Promise<void>;
  onManageBilling: () => void;
  showSubscriptionBanner?: boolean;
  hasCardConnected?: boolean;
};

export function PricingContent({
  products,
  subscriptions,
  isLoading = false,
  error = null,
  processingPriceId,
  cancelingSubscriptionId = null,
  isManagingBilling = false,
  onSubscribe,
  onCancel,
  onManageBilling,
  showSubscriptionBanner = false,
  hasCardConnected = false,
}: PricingContentProps) {
  const t = useTranslations();
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState<PricingTab>(DEFAULT_UI_BILLING_INTERVAL);
  const isMounted = useIsMounted();

  const activeSubscription = subscriptions.find(
    sub => (sub.status === StripeSubscriptionStatuses.ACTIVE || sub.status === StripeSubscriptionStatuses.TRIALING) && !sub.cancelAtPeriodEnd,
  );

  const hasAnyActiveSubscription = subscriptions.some(
    sub => (sub.status === StripeSubscriptionStatuses.ACTIVE || sub.status === StripeSubscriptionStatuses.TRIALING) && !sub.cancelAtPeriodEnd,
  );

  const getSubscriptionForPrice = (priceId: string) => {
    return subscriptions.find(
      sub => sub.priceId === priceId && (sub.status === StripeSubscriptionStatuses.ACTIVE || sub.status === StripeSubscriptionStatuses.TRIALING) && !sub.cancelAtPeriodEnd,
    );
  };

  const hasActiveSubscription = (priceId: string): boolean => {
    return !!getSubscriptionForPrice(priceId);
  };

  const customCreditsProduct = products.find(
    p => p.id === CREDIT_CONFIG.CUSTOM_CREDITS.stripeProductId,
  );
  const subscriptionProducts = products.filter(
    p => p.id !== CREDIT_CONFIG.CUSTOM_CREDITS.stripeProductId,
  );

  const getProductsForInterval = (interval: UIBillingInterval) => {
    return subscriptionProducts
      .map((product) => {
        const filteredPrices = product.prices?.filter((price: Price) => {
          if (price.unitAmount === 0) {
            return true;
          }
          return price.interval === interval;
        }) ?? [];
        return { ...product, prices: filteredPrices };
      })
      .filter(product => product.prices && product.prices.length > 0);
  };

  const getAnnualSavings = (productId: string): number => {
    const product = products.find(p => p.id === productId);
    return product?.annualSavingsPercent ?? 0;
  };

  if (isLoading) {
    return <PricingContentSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center space-y-3">
          <p className="text-sm font-medium text-destructive">{t('common.error')}</p>
          <p className="text-xs text-muted-foreground">{t('plans.errorDescription')}</p>
          <Button variant="outline" size="sm" onClick={() => router.refresh()}>
            {t('states.error.retry')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto px-3 sm:px-4 md:px-6">
      <div className="space-y-8">
        {showSubscriptionBanner && activeSubscription && isMounted && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="flex items-center gap-3 py-3">
                <Icons.creditCard className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{t('billing.currentPlan')}</p>
                  <p className="text-xs text-muted-foreground">
                    {activeSubscription.currentPeriodEnd
                      && `${t('billing.renewsOn')} ${new Date(activeSubscription.currentPeriodEnd).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium uppercase">
                    {activeSubscription.status}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onManageBilling}
                    className="gap-2"
                  >
                    {t('billing.manageBilling')}
                    <Icons.externalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <Tabs
          value={selectedTab}
          onValueChange={(value) => {
            if (isPricingTab(value)) {
              setSelectedTab(value);
            }
          }}
          className="space-y-8"
        >
          <div className="flex justify-center">
            <TabsList>
              <TabsTrigger value={UIBillingIntervals.MONTH}>
                {t('billing.interval.monthly')}
              </TabsTrigger>
              <TabsTrigger value={UIBillingIntervals.YEAR}>
                {t('billing.interval.annual')}
              </TabsTrigger>
              <TabsTrigger value={CREDITS_TAB}>
                {t('billing.interval.credits')}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={UIBillingIntervals.MONTH} className="mt-0">
            <ProductGrid
              products={getProductsForInterval(UIBillingIntervals.MONTH)}
              interval={UIBillingIntervals.MONTH}
              hasActiveSubscription={hasActiveSubscription}
              getSubscriptionForPrice={getSubscriptionForPrice}
              hasAnyActiveSubscription={hasAnyActiveSubscription}
              processingPriceId={processingPriceId}
              cancelingSubscriptionId={cancelingSubscriptionId}
              isManagingBilling={isManagingBilling}
              onSubscribe={onSubscribe}
              onCancel={onCancel}
              onManageBilling={onManageBilling}
              getAnnualSavings={getAnnualSavings}
            />
          </TabsContent>

          <TabsContent value={UIBillingIntervals.YEAR} className="mt-0">
            <ProductGrid
              products={getProductsForInterval(UIBillingIntervals.YEAR)}
              interval={UIBillingIntervals.YEAR}
              hasActiveSubscription={hasActiveSubscription}
              getSubscriptionForPrice={getSubscriptionForPrice}
              hasAnyActiveSubscription={hasAnyActiveSubscription}
              processingPriceId={processingPriceId}
              cancelingSubscriptionId={cancelingSubscriptionId}
              isManagingBilling={isManagingBilling}
              onSubscribe={onSubscribe}
              onCancel={onCancel}
              onManageBilling={onManageBilling}
              getAnnualSavings={getAnnualSavings}
            />
          </TabsContent>

          <TabsContent value={CREDITS_TAB} className="mt-0">
            <div className="w-full max-w-4xl mx-auto space-y-6">
              {!hasCardConnected && isMounted && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Alert className="border-amber-500/30 bg-amber-500/10">
                    <Icons.triangleAlert className="size-4 text-amber-500" />
                    <AlertTitle className="text-amber-600 dark:text-amber-400">
                      {t('billing.credits.connectCardRequired')}
                    </AlertTitle>
                    <AlertDescription className="flex items-center justify-between gap-4">
                      <span>{t('billing.credits.connectCardDescription')}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 border-amber-500/40 bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30"
                        onClick={() => setSelectedTab(UIBillingIntervals.MONTH)}
                      >
                        {t('billing.credits.viewPlans')}
                      </Button>
                    </AlertDescription>
                  </Alert>
                </motion.div>
              )}

              {customCreditsProduct && customCreditsProduct.prices && customCreditsProduct.prices.length > 0
                ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {customCreditsProduct.prices
                        .filter((p: Price) => !p.interval && isCreditPackagePriceId(p.id))
                        .sort((a: Price, b: Price) => (a.unitAmount ?? 0) - (b.unitAmount ?? 0))
                        .map((price: Price, index: number) => {
                          // Type guard verified in filter above - safe to access packages
                          // This runtime check ensures TypeScript narrowing for the lookup
                          if (!isCreditPackagePriceId(price.id))
                            return null;
                          const creditsAmount = CREDIT_CONFIG.CUSTOM_CREDITS.packages[price.id];
                          return isMounted
                            ? (
                                <motion.div
                                  key={price.id}
                                  initial={{ opacity: 0, scale: 0.98 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ duration: 0.3, delay: 0.05 + index * 0.05 }}
                                  className={!hasCardConnected ? 'opacity-50 pointer-events-none' : ''}
                                >
                                  <PricingCard
                                    name={`${creditsAmount.toLocaleString()} Credits`}
                                    description={t('plans.pricing.custom.features.neverExpires')}
                                    price={{
                                      amount: price.unitAmount ?? 0,
                                      currency: price.currency,
                                    }}
                                    features={[
                                      t('plans.pricing.custom.features.flexibleCredits'),
                                      t('plans.pricing.custom.features.neverExpires'),
                                    ]}
                                    isProcessingSubscribe={processingPriceId === price.id}
                                    onSubscribe={() => onSubscribe(price.id)}
                                    delay={0.05 + index * 0.05}
                                    isOneTime={true}
                                    creditsAmount={creditsAmount}
                                    disabled={!hasCardConnected}
                                  />
                                </motion.div>
                              )
                            : (
                                <div key={price.id} className={!hasCardConnected ? 'opacity-50 pointer-events-none' : ''}>
                                  <PricingCard
                                    name={`${creditsAmount.toLocaleString()} Credits`}
                                    description={t('plans.pricing.custom.features.neverExpires')}
                                    price={{
                                      amount: price.unitAmount ?? 0,
                                      currency: price.currency,
                                    }}
                                    features={[
                                      t('plans.pricing.custom.features.flexibleCredits'),
                                      t('plans.pricing.custom.features.neverExpires'),
                                    ]}
                                    isProcessingSubscribe={processingPriceId === price.id}
                                    onSubscribe={() => onSubscribe(price.id)}
                                    delay={0.05 + index * 0.05}
                                    isOneTime={true}
                                    creditsAmount={creditsAmount}
                                    disabled={!hasCardConnected}
                                  />
                                </div>
                              );
                        })}
                    </div>
                  )
                : (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground">{t('plans.noCreditsPackages')}</p>
                    </div>
                  )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

type ProductGridProps = {
  products: Product[];
  interval: UIBillingInterval;
  hasActiveSubscription: (priceId: string) => boolean;
  getSubscriptionForPrice: (priceId: string) => Subscription | undefined;
  hasAnyActiveSubscription: boolean;
  processingPriceId: string | null;
  cancelingSubscriptionId: string | null;
  isManagingBilling: boolean;
  onSubscribe: (priceId: string) => void | Promise<void>;
  onCancel: (subscriptionId: string) => void | Promise<void>;
  onManageBilling: () => void;
  getAnnualSavings: (productId: string) => number;
};

function ProductGrid({
  products,
  interval,
  hasActiveSubscription,
  getSubscriptionForPrice,
  hasAnyActiveSubscription,
  processingPriceId,
  cancelingSubscriptionId,
  isManagingBilling,
  onSubscribe,
  onCancel,
  onManageBilling,
  getAnnualSavings,
}: ProductGridProps) {
  const t = useTranslations();
  const isMounted = useIsMounted();

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">
          {t('billing.noPlansForInterval')}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="grid grid-cols-1 gap-6 w-full sm:grid-cols-2">
        {products.map((product, index) => {
          const price = product.prices?.[0];

          if (!price || price.unitAmount === undefined || price.unitAmount === null) {
            return null;
          }

          const subscription = getSubscriptionForPrice(price.id);
          const hasSubscription = hasActiveSubscription(price.id);
          const isMostPopular = price.unitAmount > 0 && products.length >= 2 && index === 1;
          const isFreeProduct = price.unitAmount === 0;

          const cardContent = (
            <PricingCard
              name={product.name}
              description={product.description}
              price={{
                amount: price.unitAmount,
                currency: price.currency,
                interval,
                trialDays: price.trialPeriodDays,
              }}
              features={product.features}
              isCurrentPlan={hasSubscription}
              isMostPopular={isMostPopular}
              isProcessingSubscribe={processingPriceId === price.id}
              isProcessingCancel={subscription ? cancelingSubscriptionId === subscription.id : false}
              isProcessingManageBilling={hasSubscription ? isManagingBilling : false}
              hasOtherSubscription={hasAnyActiveSubscription && !hasSubscription}
              onSubscribe={() => onSubscribe(price.id)}
              onCancel={subscription ? () => onCancel(subscription.id) : undefined}
              onManageBilling={hasSubscription ? onManageBilling : undefined}
              delay={index * 0.1}
              annualSavingsPercent={interval === UIBillingIntervals.YEAR ? getAnnualSavings(product.id) : undefined}
              isFreeProduct={isFreeProduct}
            />
          );

          return isMounted
            ? (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                >
                  {cardContent}
                </motion.div>
              )
            : (
                <div key={product.id}>
                  {cardContent}
                </div>
              );
        })}
      </div>
    </div>
  );
}
