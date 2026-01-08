'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';

import { UIBillingIntervals } from '@/api/core/enums';
import { ChatPageHeader } from '@/components/chat/chat-header';
import { ChatPage } from '@/components/chat/chat-states';
import { Icons } from '@/components/icons';
import { PricingContentSkeleton } from '@/components/pricing/pricing-content-skeleton';
import { Button } from '@/components/ui/button';
import { PricingCard } from '@/components/ui/pricing-card';
import { useCreateCheckoutSessionMutation, useProductsQuery } from '@/hooks';
import { useAuthCheck } from '@/hooks/utils/use-auth-check';
import { toastManager } from '@/lib/toast';
import { cn } from '@/lib/ui/cn';
import { getApiErrorMessage } from '@/lib/utils';

export function PublicPricingScreen() {
  const router = useRouter();
  const t = useTranslations();
  const { isAuthenticated } = useAuthCheck();
  const [processingPriceId, setProcessingPriceId] = useState<string | null>(null);

  const hasMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const { data: productsData, isLoading: isLoadingProducts, error: productsError } = useProductsQuery();
  const createCheckoutMutation = useCreateCheckoutSessionMutation();

  const products = productsData?.success ? productsData.data?.items ?? [] : [];
  const hasValidProductData = productsData?.success && !!productsData.data?.items;

  const shouldShowError = hasMounted && (productsError || (productsData && !productsData.success));
  const shouldShowLoading = !hasMounted || isLoadingProducts || (!hasValidProductData && !shouldShowError);

  const monthlyProducts = products
    .filter((product) => {
      return product.prices?.some(
        price =>
          price.interval === UIBillingIntervals.MONTH
          && price.unitAmount != null,
      );
    })
    .map((product) => {
      const filteredPrices = product.prices!.filter(
        price =>
          price.interval === UIBillingIntervals.MONTH
          && price.unitAmount != null,
      );
      return { ...product, prices: filteredPrices };
    })
    .sort((a, b) => {
      const priceA = a.prices?.[0]?.unitAmount ?? 0;
      const priceB = b.prices?.[0]?.unitAmount ?? 0;
      return priceA - priceB;
    });

  const handleSubscribe = async (priceId: string) => {
    if (isAuthenticated) {
      setProcessingPriceId(priceId);
      try {
        const result = await createCheckoutMutation.mutateAsync({
          json: { priceId },
        });

        if (result.success && result.data?.url) {
          window.location.href = result.data.url;
        }
      } catch (error) {
        toastManager.error(t('billing.errors.subscribeFailed'), getApiErrorMessage(error));
      } finally {
        setProcessingPriceId(null);
      }
    } else {
      const returnUrl = `/chat/pricing?priceId=${priceId}`;
      router.push(`/auth/sign-up?redirect=${encodeURIComponent(returnUrl)}`);
    }
  };

  if (shouldShowLoading) {
    return (
      <ChatPage>
        <ChatPageHeader
          title={t('pricing.page.title')}
          description={t('pricing.page.description')}
        />
        <div className="flex-1 overflow-y-auto py-6">
          <PricingContentSkeleton />
        </div>
      </ChatPage>
    );
  }

  if (shouldShowError) {
    return (
      <ChatPage>
        <ChatPageHeader
          title={t('pricing.page.title')}
          description={t('pricing.page.description')}
        />
        <div className="container max-w-6xl mx-auto px-4 py-16">
          <div className="text-center">
            <Icons.alertCircle className="size-12 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t('pricing.error.title')}</h2>
            <p className="text-muted-foreground mb-6">{t('pricing.error.description')}</p>
            <Button asChild>
              <Link href="/">{t('common.backToHome')}</Link>
            </Button>
          </div>
        </div>
      </ChatPage>
    );
  }

  return (
    <ChatPage>
      <ChatPageHeader
        title={t('pricing.page.title')}
        description={t('pricing.page.description')}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="container max-w-6xl mx-auto px-4 py-8">
          <div
            className={cn(
              'grid gap-6 max-w-5xl mx-auto',
              monthlyProducts.length === 1 && 'grid-cols-1 max-w-md',
              monthlyProducts.length === 2 && 'grid-cols-1 md:grid-cols-2 max-w-3xl',
              monthlyProducts.length >= 3 && 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
            )}
          >
            {monthlyProducts.map((product, index) => {
              const price = product.prices?.[0];
              if (!price)
                return null;

              const isPopular = monthlyProducts.length >= 2 && index === 1;

              return (
                <PricingCard
                  key={product.id}
                  name={product.name}
                  description={product.description}
                  price={{
                    amount: price.unitAmount ?? 0,
                    currency: price.currency ?? 'usd',
                    interval: UIBillingIntervals.MONTH,
                    trialDays: price.trialPeriodDays,
                  }}
                  features={product.features ?? []}
                  isMostPopular={isPopular}
                  delay={index * 0.1}
                  isProcessingSubscribe={processingPriceId === price.id}
                  onSubscribe={() => handleSubscribe(price.id)}
                />
              );
            })}
          </div>

        </div>
      </div>
    </ChatPage>
  );
}
