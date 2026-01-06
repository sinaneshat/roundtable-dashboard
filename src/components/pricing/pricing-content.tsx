'use client';

import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import {
  StripeSubscriptionStatuses,
  UIBillingIntervals,
} from '@/api/core/enums';
import type { Price, Product, Subscription } from '@/api/routes/billing/schema';
import { Icons } from '@/components/icons';
import { PricingContentSkeleton } from '@/components/pricing/pricing-content-skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PricingCard } from '@/components/ui/pricing-card';
import { useIsMounted } from '@/hooks/utils';

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

type ProductGridProps = {
  products: Product[];
  hasActiveSubscription: (priceId: string) => boolean;
  getSubscriptionForPrice: (priceId: string) => Subscription | undefined;
  hasAnyActiveSubscription: boolean;
  processingPriceId: string | null;
  cancelingSubscriptionId: string | null;
  isManagingBilling: boolean;
  onSubscribe: (priceId: string) => void | Promise<void>;
  onCancel: (subscriptionId: string) => void | Promise<void>;
  onManageBilling: () => void;
  showSubscriptionBanner: boolean;
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
}: PricingContentProps) {
  const t = useTranslations();
  const router = useRouter();
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

  const monthlyProducts = products
    .filter((product) => {
      if (!product.prices || product.prices.length === 0) {
        return false;
      }
      return product.prices.some((price: Price) => {
        return price.interval === 'month'
          && price.unitAmount !== null
          && price.unitAmount !== undefined;
      });
    })
    .map((product) => {
      const filteredPrices = product.prices!.filter((price: Price) => {
        return price.interval === 'month'
          && price.unitAmount !== null
          && price.unitAmount !== undefined;
      });
      return { ...product, prices: filteredPrices };
    });

  if (isLoading) {
    return <PricingContentSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center space-y-3">
          <p className="text-sm font-medium text-destructive">Error</p>
          <p className="text-xs text-muted-foreground">{t('plans.errorDescription')}</p>
          <Button variant="outline" size="sm" onClick={() => router.refresh()}>
            Retry
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

        <ProductGrid
          products={monthlyProducts}
          hasActiveSubscription={hasActiveSubscription}
          getSubscriptionForPrice={getSubscriptionForPrice}
          hasAnyActiveSubscription={hasAnyActiveSubscription}
          processingPriceId={processingPriceId}
          cancelingSubscriptionId={cancelingSubscriptionId}
          isManagingBilling={isManagingBilling}
          onSubscribe={onSubscribe}
          onCancel={onCancel}
          onManageBilling={onManageBilling}
          showSubscriptionBanner={showSubscriptionBanner || false}
        />
      </div>
    </div>
  );
}

function ProductGrid({
  products,
  hasActiveSubscription,
  getSubscriptionForPrice,
  hasAnyActiveSubscription,
  processingPriceId,
  cancelingSubscriptionId,
  isManagingBilling,
  onSubscribe,
  onCancel,
  onManageBilling,
  showSubscriptionBanner,
}: ProductGridProps) {
  const isMounted = useIsMounted();

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">
          No plans available
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="grid grid-cols-1 gap-6 w-full">
        {products.map((product, index) => {
          const price = product.prices?.[0];

          if (!price || price.unitAmount === undefined || price.unitAmount === null) {
            return null;
          }

          const subscription = getSubscriptionForPrice(price.id);
          const hasSubscription = hasActiveSubscription(price.id);

          const cardContent = (
            <PricingCard
              name={product.name}
              description={product.description}
              price={{
                amount: price.unitAmount,
                currency: price.currency,
                interval: UIBillingIntervals.MONTH,
                trialDays: price.trialPeriodDays,
              }}
              features={product.features}
              isCurrentPlan={!showSubscriptionBanner && hasSubscription}
              isMostPopular={true}
              isProcessingSubscribe={processingPriceId === price.id}
              isProcessingCancel={subscription ? cancelingSubscriptionId === subscription.id : false}
              isProcessingManageBilling={hasSubscription ? isManagingBilling : false}
              hasOtherSubscription={hasAnyActiveSubscription && !hasSubscription}
              onSubscribe={() => onSubscribe(price.id)}
              onCancel={subscription ? () => onCancel(subscription.id) : undefined}
              onManageBilling={hasSubscription ? onManageBilling : undefined}
              delay={index * 0.1}
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
