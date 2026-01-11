'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';

import { UIBillingIntervals } from '@/api/core/enums';
import { ChatPage } from '@/components/chat/chat-states';
import { Icons } from '@/components/icons';
import { PricingContentSkeleton } from '@/components/pricing/pricing-content-skeleton';
import { Button } from '@/components/ui/button';
import { PricingCard } from '@/components/ui/pricing-card';
import { useCreateCheckoutSessionMutation, useProductsQuery } from '@/hooks';
import { useAuthCheck } from '@/hooks/utils/use-auth-check';
import { toastManager } from '@/lib/toast';
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
    .filter(product =>
      product.prices?.some(
        price => price.interval === UIBillingIntervals.MONTH && price.unitAmount != null,
      ))
    .map(product => ({
      ...product,
      prices: product.prices!.filter(
        price => price.interval === UIBillingIntervals.MONTH && price.unitAmount != null,
      ),
    }))
    .sort((a, b) => (a.prices?.[0]?.unitAmount ?? 0) - (b.prices?.[0]?.unitAmount ?? 0));

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
        <div className="flex-1 overflow-y-auto flex items-center justify-center py-6">
          <PricingContentSkeleton />
        </div>
      </ChatPage>
    );
  }

  if (shouldShowError) {
    return (
      <ChatPage>
        <div className="flex-1 overflow-y-auto flex items-center justify-center">
          <div className="text-center px-4">
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

  const product = monthlyProducts[0];
  const price = product?.prices?.[0];

  return (
    <ChatPage className="h-full min-h-[calc(100vh-4rem)]">
      <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <div className="w-full max-w-md mx-auto px-4 py-8">
          {product && price && (
            <PricingCard
              key={product.id}
              name={product.name}
              price={{
                amount: price.unitAmount ?? 0,
                currency: price.currency ?? 'usd',
                interval: UIBillingIntervals.MONTH,
              }}
              isMostPopular={true}
              delay={0}
              isProcessingSubscribe={processingPriceId === price.id}
              onSubscribe={() => handleSubscribe(price.id)}
            />
          )}
        </div>
      </div>
    </ChatPage>
  );
}
