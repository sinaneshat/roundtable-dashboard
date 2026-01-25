import { StripeSubscriptionStatuses, SubscriptionTiers, UIBillingIntervals } from '@roundtable/shared';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { ChatPage } from '@/components/chat/chat-states';
import { Icons } from '@/components/icons';
import { PricingContentSkeleton } from '@/components/pricing/pricing-content-skeleton';
import { Button } from '@/components/ui/button';
import { PricingCard } from '@/components/ui/pricing-card';
import {
  useAuthCheck,
  useCancelSubscriptionMutation,
  useCreateCheckoutSessionMutation,
  useCreateCustomerPortalSessionMutation,
  useProductsQuery,
  useSubscriptionsQuery,
} from '@/hooks';
import { useTranslations } from '@/lib/i18n';
import { toastManager } from '@/lib/toast';
import { getApiErrorMessage } from '@/lib/utils';
import dynamic from '@/lib/utils/dynamic';
import type { Price, Product } from '@/services/api/billing/products';
import type { Subscription } from '@/services/api/billing/subscriptions';

const CancelSubscriptionDialog = dynamic(
  () => import('@/components/chat/cancel-subscription-dialog').then(m => ({ default: m.CancelSubscriptionDialog })),
  { ssr: false },
);

export function PublicPricingScreen() {
  const navigate = useNavigate();
  const t = useTranslations();
  const { isAuthenticated } = useAuthCheck();
  const [processingPriceId, setProcessingPriceId] = useState<string | null>(null);
  const [isManagingBilling, setIsManagingBilling] = useState(false);
  const [cancelingSubscriptionId, setCancelingSubscriptionId] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const { data: productsData, isLoading: isLoadingProducts, error: productsError } = useProductsQuery();
  const { data: subscriptionsData } = useSubscriptionsQuery();
  const createCheckoutMutation = useCreateCheckoutSessionMutation();
  const customerPortalMutation = useCreateCustomerPortalSessionMutation();
  const cancelSubscriptionMutation = useCancelSubscriptionMutation();

  // Type narrowing for API responses
  type ApiResponse<T> = { success: boolean; data?: T };
  type ProductsResponse = { items?: Product[] };
  type SubscriptionsResponse = { items?: Subscription[] };

  const typedProductsData = productsData as ApiResponse<ProductsResponse> | undefined;
  const typedSubscriptionsData = subscriptionsData as ApiResponse<SubscriptionsResponse> | undefined;

  const subscriptions: Subscription[] = typedSubscriptionsData?.success ? typedSubscriptionsData.data?.items ?? [] : [];
  const products = typedProductsData?.success ? typedProductsData.data?.items ?? [] : [];

  const hasValidProductData = typedProductsData?.success && !!typedProductsData.data?.items;
  // Trust SSR data - ensureQueryData in loader pre-populates cache before render
  const shouldShowError = productsError || (typedProductsData && !typedProductsData.success);
  // Show loading if: actively loading OR no valid data yet (and no error)
  // This ensures we never render empty state - always show loading, error, or content
  const shouldShowLoading = isLoadingProducts || (!hasValidProductData && !shouldShowError);

  const monthlyProducts = products
    .filter((product): product is typeof product & { prices: NonNullable<typeof product.prices> } => {
      const prices = product.prices as NonNullable<typeof product.prices> | undefined;
      return prices !== undefined
        && prices !== null
        && prices.some(
          (price: Price) => price.interval === UIBillingIntervals.MONTH && price.unitAmount != null,
        );
    })
    .map(product => ({
      ...product,
      prices: product.prices.filter(
        (price: Price) => price.interval === UIBillingIntervals.MONTH && price.unitAmount != null,
      ),
    }))
    .sort((a, b) => (a.prices?.[0]?.unitAmount ?? 0) - (b.prices?.[0]?.unitAmount ?? 0));

  const handleSubscribe = async (priceId: string) => {
    if (isAuthenticated) {
      setProcessingPriceId(priceId);
      try {
        type CheckoutResponse = { url?: string };
        const result = await createCheckoutMutation.mutateAsync({
          json: { priceId },
        }) as ApiResponse<CheckoutResponse> | undefined;

        if (result?.success && result.data?.url) {
          // External redirect to Stripe checkout - window.location.href is appropriate here
          window.location.href = result.data.url;
        }
      } catch (error) {
        toastManager.error(t('billing.errors.subscribeFailed'), getApiErrorMessage(error));
      } finally {
        setProcessingPriceId(null);
      }
    } else {
      // ✅ Use TanStack Router search option for type-safe query params
      const returnUrl = `/chat/pricing?priceId=${priceId}`;
      navigate({ to: '/auth/sign-in', search: { redirect: returnUrl } });
    }
  };

  const handleManageBilling = async () => {
    setIsManagingBilling(true);
    try {
      type PortalResponse = { url?: string };
      const result = await customerPortalMutation.mutateAsync({
        json: {
          // Reading current URL (not navigating) - window.location.href is appropriate
          returnUrl: window.location.href,
        },
      }) as ApiResponse<PortalResponse> | undefined;

      if (result?.success && result.data?.url) {
        window.open(result.data.url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      toastManager.error(t('billing.errors.manageBillingFailed'), getApiErrorMessage(error));
    } finally {
      setIsManagingBilling(false);
    }
  };

  // Get active subscription for a specific price
  const getSubscriptionForPrice = (priceId: string): Subscription | undefined => {
    return subscriptions.find(
      sub => sub.priceId === priceId && (sub.status === StripeSubscriptionStatuses.ACTIVE || sub.status === StripeSubscriptionStatuses.TRIALING),
    );
  };

  // Check if subscription is cancelable (not already pending cancellation)
  const isSubscriptionCancelable = (subscription: Subscription | undefined): boolean => {
    return !!subscription && !subscription.cancelAtPeriodEnd;
  };

  const handleCancel = () => {
    setShowCancelDialog(true);
  };

  const handleConfirmCancellation = async (subscriptionId: string) => {
    setCancelingSubscriptionId(subscriptionId);
    try {
      const result = await cancelSubscriptionMutation.mutateAsync({
        param: { id: subscriptionId },
        json: { immediately: false },
      }) as ApiResponse<unknown> | undefined;

      if (result?.success) {
        setShowCancelDialog(false);
        toastManager.success(t('billing.cancelSuccess'));
      }
    } catch (error) {
      toastManager.error(t('billing.errors.cancelFailed'), getApiErrorMessage(error));
    } finally {
      setCancelingSubscriptionId(null);
    }
  };

  if (shouldShowLoading) {
    return (
      <ChatPage className="h-full min-h-[calc(100vh-4rem)]">
        <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-8rem)]">
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
            <h1 className="text-xl font-semibold mb-2">{t('pricing.error.title')}</h1>
            <p className="text-muted-foreground mb-6">{t('pricing.error.description')}</p>
            <Button asChild>
              <Link to="/">{t('common.backToHome')}</Link>
            </Button>
          </div>
        </div>
      </ChatPage>
    );
  }

  const product = monthlyProducts[0];
  const price: Price | undefined = product?.prices?.[0];
  const subscription: Subscription | undefined = price ? getSubscriptionForPrice(price.id) : undefined;
  const hasCurrentSubscription = !!subscription;
  const canCancel = isSubscriptionCancelable(subscription);

  return (
    <>
      <ChatPage className="h-full min-h-[calc(100vh-4rem)]">
        <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-8rem)]">
          <div className="w-full max-w-md mx-auto px-4 py-8">
            <h1 className="sr-only">{t('pricing.pageTitle')}</h1>
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
                isCurrentPlan={hasCurrentSubscription}
                delay={0}
                isProcessingSubscribe={processingPriceId === price.id}
                isProcessingManageBilling={isManagingBilling}
                isProcessingCancel={!!cancelingSubscriptionId}
                onSubscribe={() => handleSubscribe(price.id)}
                onManageBilling={hasCurrentSubscription ? handleManageBilling : undefined}
                onCancel={canCancel ? handleCancel : undefined}
                disabled={hasCurrentSubscription}
              />
            )}
          </div>
        </div>
      </ChatPage>

      {showCancelDialog && subscription && (
        <CancelSubscriptionDialog
          open={showCancelDialog}
          onOpenChange={setShowCancelDialog}
          onConfirm={() => handleConfirmCancellation(subscription.id)}
          subscriptionTier={SubscriptionTiers.PRO}
          currentPeriodEnd={subscription.currentPeriodEnd}
          isProcessing={!!cancelingSubscriptionId}
        />
      )}
    </>
  );
}
