'use client';

import { CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { UIBillingInterval } from '@/api/core/enums';
import {
  DEFAULT_UI_BILLING_INTERVAL,
  isUIBillingInterval,
  StripeSubscriptionStatuses,
} from '@/api/core/enums';
import type { Product } from '@/api/routes/billing/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FreePricingCard } from '@/components/ui/free-pricing-card';
import { PricingCard } from '@/components/ui/pricing-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Subscription } from '@/types/billing';

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
};

/**
 * Shared Pricing Content Component
 *
 * Displays available subscription plans with pricing and management options.
 */
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
}: PricingContentProps) {
  const t = useTranslations();
  const router = useRouter();
  const [selectedInterval, setSelectedInterval] = useState<UIBillingInterval>(DEFAULT_UI_BILLING_INTERVAL);

  // Get active subscription (excluding canceled or scheduled for cancellation)
  const activeSubscription = subscriptions.find(
    sub => (sub.status === StripeSubscriptionStatuses.ACTIVE || sub.status === StripeSubscriptionStatuses.TRIALING) && !sub.cancelAtPeriodEnd,
  );

  // Check if user has ANY active subscription (excluding canceled or scheduled for cancellation)
  const hasAnyActiveSubscription = subscriptions.some(
    sub => (sub.status === StripeSubscriptionStatuses.ACTIVE || sub.status === StripeSubscriptionStatuses.TRIALING) && !sub.cancelAtPeriodEnd,
  );

  // Get subscription for a specific price (differentiates monthly vs annual, excluding canceled)
  const getSubscriptionForPrice = (priceId: string) => {
    return subscriptions.find(
      sub => sub.priceId === priceId && (sub.status === StripeSubscriptionStatuses.ACTIVE || sub.status === StripeSubscriptionStatuses.TRIALING) && !sub.cancelAtPeriodEnd,
    );
  };

  // Check if user has active subscription for a specific price (excluding canceled)
  const hasActiveSubscription = (priceId: string): boolean => {
    return !!getSubscriptionForPrice(priceId);
  };

  // Filter products by interval
  const getProductsForInterval = (interval: UIBillingInterval) => {
    return products
      .map((product) => {
        const filteredPrices = product.prices?.filter(price => price.interval === interval) || [];
        return { ...product, prices: filteredPrices };
      })
      .filter(product => product.prices && product.prices.length > 0);
  };

  // ✅ BACKEND-COMPUTED: Get annual savings from product data (no frontend calculation)
  const getAnnualSavings = (productId: string): number => {
    const product = products.find(p => p.id === productId);
    return product?.annualSavingsPercent ?? 0;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Error state
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
        {/* Active Subscription Banner */}
        {showSubscriptionBanner && activeSubscription && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="flex items-center gap-3 py-3">
                <CreditCard className="h-5 w-5 text-primary shrink-0" />
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
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Pricing Content */}
        <Tabs
          value={selectedInterval}
          onValueChange={value => isUIBillingInterval(value) && setSelectedInterval(value)}
          className="space-y-8"
        >
          {/* Billing Interval Toggle */}
          <div className="flex justify-center">
            <TabsList>
              <TabsTrigger value="month">
                {t('billing.interval.monthly')}
              </TabsTrigger>
              <TabsTrigger value="year">
                {t('billing.interval.annual')}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Monthly Plans */}
          <TabsContent value="month" className="mt-0">
            <ProductGrid
              products={getProductsForInterval('month')}
              interval="month"
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
              t={t}
            />
          </TabsContent>

          {/* Annual Plans */}
          <TabsContent value="year" className="mt-0">
            <ProductGrid
              products={getProductsForInterval('year')}
              interval="year"
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
              t={t}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// Product Grid Component
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
  t: (key: string) => string;
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
  t,
}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16"
      >
        <p className="text-sm text-muted-foreground">
          {t('billing.noPlansForInterval')}
        </p>
      </motion.div>
    );
  }

  // Define the free tier product
  const freeTierProduct = {
    id: 'free-tier',
    name: t('plans.pricing.free.name'),
    description: t('plans.pricing.free.description'),
    features: [
      t('plans.pricing.free.features.messagesPerMonth'),
      t('plans.pricing.free.features.conversationsPerMonth'),
      t('plans.pricing.free.features.aiModels'),
      t('plans.pricing.free.features.basicSupport'),
    ],
  };

  return (
    <div className="w-full">
      {/* Responsive grid - up to 4 columns on large screens */}
      <div className="grid grid-cols-1 gap-6 w-full sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* Free Tier Card - Always First */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0 }}
        >
          <FreePricingCard
            name={freeTierProduct.name}
            description={freeTierProduct.description}
            price={{
              amount: 0, // Free tier
              currency: 'usd',
              interval,
            }}
            features={freeTierProduct.features}
            delay={0}
          />
        </motion.div>

        {/* Paid Plans */}
        {products.map((product, index) => {
          const price = product.prices?.[0]; // Get first price for this interval

          // Skip products without valid prices
          if (!price || !price.unitAmount) {
            return null;
          }

          // Check subscription by specific price ID (differentiates monthly vs annual)
          const subscription = getSubscriptionForPrice(price.id);
          const hasSubscription = hasActiveSubscription(price.id);

          // Adjust most popular logic: middle card of paid plans (index 1 of paid plans = index 2 overall with free tier)
          const isMostPopular = products.length === 3 && index === 1;

          return (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: (index + 1) * 0.1 }}
            >
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
                delay={(index + 1) * 0.1} // Add 1 to account for free tier being first
                annualSavingsPercent={interval === 'year' ? getAnnualSavings(product.id) : undefined}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
