import { StripeSubscriptionStatuses, SubscriptionChangeTypes } from '@roundtable/shared';
import { useState } from 'react';

import { ChatPageHeader } from '@/components/chat/chat-header';
import { ChatPage } from '@/components/chat/chat-states';
import { PricingContent } from '@/components/pricing/pricing-content';
import {
  useCancelSubscriptionMutation,
  useCreateCheckoutSessionMutation,
  useCreateCustomerPortalSessionMutation,
  useProductsQuery,
  useSubscriptionsQuery,
  useSwitchSubscriptionMutation,
} from '@/hooks';
import { useRouter, useTranslations } from '@/lib/compat';
import { toastManager } from '@/lib/toast';
import { getApiErrorMessage } from '@/lib/utils';
import type { Product, Subscription } from '@/types/billing';

export default function PricingScreen() {
  const router = useRouter();
  const t = useTranslations();
  const [processingPriceId, setProcessingPriceId] = useState<string | null>(null);
  const [cancelingSubscriptionId, setCancelingSubscriptionId] = useState<string | null>(null);
  const [isManagingBilling, setIsManagingBilling] = useState(false);

  const { data: productsData, isLoading: isLoadingProducts, error: productsError } = useProductsQuery();
  const { data: subscriptionsData } = useSubscriptionsQuery();

  const createCheckoutMutation = useCreateCheckoutSessionMutation();
  const cancelMutation = useCancelSubscriptionMutation();
  const switchMutation = useSwitchSubscriptionMutation();
  const customerPortalMutation = useCreateCustomerPortalSessionMutation();

  // Type narrowing for API responses
  type ApiResponse<T> = { success: boolean; data?: T };
  type ProductsResponse = { items?: Product[] };
  type SubscriptionsResponse = { items?: Subscription[] };

  const typedProductsData = productsData as ApiResponse<ProductsResponse> | undefined;
  const typedSubscriptionsData = subscriptionsData as ApiResponse<SubscriptionsResponse> | undefined;

  const products = typedProductsData?.success ? typedProductsData.data?.items ?? [] : [];
  const subscriptions: Subscription[] = typedSubscriptionsData?.success ? typedSubscriptionsData.data?.items ?? [] : [];

  const hasValidProductData = typedProductsData?.success && !!typedProductsData.data?.items;
  const shouldShowError = productsError || (typedProductsData && !typedProductsData.success);
  const shouldShowLoading = isLoadingProducts || (!hasValidProductData && !shouldShowError);

  const activeSubscription = subscriptions.find(
    sub => (sub.status === StripeSubscriptionStatuses.ACTIVE || sub.status === StripeSubscriptionStatuses.TRIALING) && !sub.cancelAtPeriodEnd,
  );

  const handleSubscribe = async (priceId: string) => {
    setProcessingPriceId(priceId);
    try {
      if (activeSubscription) {
        type SwitchResponse = {
          changeDetails?: {
            isUpgrade: boolean;
            isDowngrade: boolean;
            oldPrice: { productId: string };
            newPrice: { productId: string };
          };
        };
        const result = await switchMutation.mutateAsync({
          param: { id: activeSubscription.id },
          json: { newPriceId: priceId },
        }) as ApiResponse<SwitchResponse> | undefined;

        if (result?.success) {
          const changeDetails = result.data?.changeDetails;

          if (changeDetails) {
            const changeType = changeDetails.isUpgrade
              ? SubscriptionChangeTypes.UPGRADE
              : changeDetails.isDowngrade
                ? SubscriptionChangeTypes.DOWNGRADE
                : SubscriptionChangeTypes.CHANGE;

            const params = new URLSearchParams({
              changeType,
              oldProductId: changeDetails.oldPrice.productId,
              newProductId: changeDetails.newPrice.productId,
            });

            router.replace(`/chat/billing/subscription-changed?${params.toString()}`);
          } else {
            router.replace('/chat/billing/subscription-changed');
          }
        }
      } else {
        type CheckoutResponse = { url?: string };
        const result = await createCheckoutMutation.mutateAsync({
          json: { priceId },
        }) as ApiResponse<CheckoutResponse> | undefined;

        if (result?.success && result.data?.url) {
          // External redirect to Stripe checkout - window.location.href is appropriate here
          window.location.href = result.data.url;
        }
      }
    } catch (error) {
      toastManager.error(t('billing.errors.subscribeFailed'), getApiErrorMessage(error));
    } finally {
      setProcessingPriceId(null);
    }
  };

  const handleCancel = async (subscriptionId: string) => {
    setCancelingSubscriptionId(subscriptionId);
    try {
      await cancelMutation.mutateAsync({
        param: { id: subscriptionId },
        json: { immediately: false },
      });
    } catch (error) {
      toastManager.error(t('billing.errors.cancelFailed'), getApiErrorMessage(error));
    } finally {
      setCancelingSubscriptionId(null);
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

  return (
    <ChatPage>
      <ChatPageHeader
        title={t('pricing.page.title')}
        description={t('pricing.page.description')}
      />

      <PricingContent
        products={products}
        subscriptions={subscriptions}
        isLoading={shouldShowLoading}
        error={shouldShowError ? productsError : null}
        processingPriceId={processingPriceId}
        cancelingSubscriptionId={cancelingSubscriptionId}
        isManagingBilling={isManagingBilling}
        onSubscribe={handleSubscribe}
        onCancel={handleCancel}
        onManageBilling={handleManageBilling}
        showSubscriptionBanner={false}
      />
    </ChatPage>
  );
}
