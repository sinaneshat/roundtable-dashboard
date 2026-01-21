import { UIBillingIntervals } from '@roundtable/shared';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PricingCard } from '@/components/ui/pricing-card';
import { useTranslations } from '@/lib/i18n';
import { isSubscriptionActive } from '@/lib/utils';
import type { Price, Product } from '@/services/api/billing/products';
import type { Subscription } from '@/services/api/billing/subscriptions';

type PricingContentProps = {
  products: Product[];
  subscriptions: Subscription[];
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

  const activeSubscription = subscriptions.find(isSubscriptionActive);

  const hasAnyActiveSubscription = subscriptions.some(isSubscriptionActive);

  const getSubscriptionForPrice = (priceId: string): Subscription | undefined => {
    return subscriptions.find(
      sub => sub.priceId === priceId && isSubscriptionActive(sub),
    );
  };

  const hasActiveSubscription = (priceId: string): boolean => {
    return !!getSubscriptionForPrice(priceId);
  };

  const monthlyProducts = products
    .filter((product): product is typeof product & { prices: NonNullable<typeof product.prices> } => {
      if (!product.prices || product.prices.length === 0) {
        return false;
      }
      const pricesArray = product.prices as Price[];
      return pricesArray.some((price) => {
        return price.interval === 'month'
          && price.unitAmount !== null
          && price.unitAmount !== undefined;
      });
    })
    .map((product) => {
      const prices = (product.prices ?? []) as Price[];
      const filteredPrices = prices.filter((price) => {
        return price.interval === 'month'
          && price.unitAmount !== null
          && price.unitAmount !== undefined;
      });
      return { ...product, prices: filteredPrices };
    });

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center space-y-3">
          <p className="text-sm font-medium text-destructive">{t('plans.error')}</p>
          <p className="text-xs text-muted-foreground">{t('plans.errorDescription')}</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            {t('actions.tryAgain')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto px-3 sm:px-4 md:px-6">
      <div className="space-y-8">
        {showSubscriptionBanner && activeSubscription && (
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
  const t = useTranslations();

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">
          {t('plans.noPlansAvailable')}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="grid grid-cols-1 gap-6 w-full">
        {products.map((product, index) => {
          const price = product.prices?.[0] as Price | undefined;

          if (!price || price.unitAmount === undefined || price.unitAmount === null) {
            return null;
          }

          const subscription: Subscription | undefined = getSubscriptionForPrice(price.id);
          const hasSubscription = hasActiveSubscription(price.id);

          return (
            <div key={product.id}>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
