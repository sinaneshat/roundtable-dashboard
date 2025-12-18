'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { StripeSubscriptionStatuses, SubscriptionChangeTypes } from '@/api/core/enums';
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
import { toastManager } from '@/lib/toast';
import { getApiErrorMessage } from '@/lib/utils/error-handling';

export default function PricingScreen() {
  const t = useTranslations();
  const [processingPriceId, setProcessingPriceId] = useState<string | null>(null);
  const [cancelingSubscriptionId, setCancelingSubscriptionId] = useState<string | null>(null);
  const [isManagingBilling, setIsManagingBilling] = useState(false);

  const { data: productsData, isLoading: isLoadingProducts, error: productsError } = useProductsQuery();
  const { data: subscriptionsData, isLoading: isLoadingSubscriptions } = useSubscriptionsQuery();

  const createCheckoutMutation = useCreateCheckoutSessionMutation();
  const cancelMutation = useCancelSubscriptionMutation();
  const switchMutation = useSwitchSubscriptionMutation();
  const customerPortalMutation = useCreateCustomerPortalSessionMutation();

  const products = productsData?.success ? productsData.data?.items || [] : [];
  const subscriptions = subscriptionsData?.success ? subscriptionsData.data?.items || [] : [];

  const activeSubscription = subscriptions.find(
    sub => (sub.status === StripeSubscriptionStatuses.ACTIVE || sub.status === StripeSubscriptionStatuses.TRIALING) && !sub.cancelAtPeriodEnd,
  );

  const handleSubscribe = async (priceId: string) => {
    setProcessingPriceId(priceId);
    try {
      if (activeSubscription) {
        const result = await switchMutation.mutateAsync({
          param: { id: activeSubscription.id },
          json: { newPriceId: priceId },
        });

        if (result.success) {
          const changeDetails = result.data?.changeDetails;

          if (changeDetails) {
            const changeType = changeDetails.isUpgrade ? SubscriptionChangeTypes.UPGRADE : changeDetails.isDowngrade ? SubscriptionChangeTypes.DOWNGRADE : SubscriptionChangeTypes.CHANGE;

            const params = new URLSearchParams({
              changeType,
              oldProductId: changeDetails.oldPrice.productId,
              newProductId: changeDetails.newPrice.productId,
            });

            window.location.href = `/chat/billing/subscription-changed?${params.toString()}`;
          } else {
            window.location.href = '/chat/billing/subscription-changed';
          }
        }
      } else {
        const result = await createCheckoutMutation.mutateAsync({
          json: { priceId },
        });

        if (result.success && result.data?.url) {
          window.location.href = result.data.url;
        }
      }
    } catch (error) {
      console.error('[Pricing] Subscribe failed:', error);
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
      console.error('[Pricing] Cancel subscription failed:', error);
      toastManager.error(t('billing.errors.cancelFailed'), getApiErrorMessage(error));
    } finally {
      setCancelingSubscriptionId(null);
    }
  };

  const handleManageBilling = async () => {
    setIsManagingBilling(true);
    try {
      const result = await customerPortalMutation.mutateAsync({
        json: {
          returnUrl: window.location.href,
        },
      });

      if (result.success && result.data?.url) {
        window.open(result.data.url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('[Pricing] Manage billing failed:', error);
      toastManager.error(t('billing.errors.manageBillingFailed'), getApiErrorMessage(error));
    } finally {
      setIsManagingBilling(false);
    }
  };

  const isLoading = isLoadingProducts || isLoadingSubscriptions;

  return (
    <ChatPage>
      <ChatPageHeader
        title={t('billing.products.title')}
        description={t('billing.products.description')}
      />

      <PricingContent
        products={products}
        subscriptions={subscriptions}
        isLoading={isLoading}
        error={productsError}
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
