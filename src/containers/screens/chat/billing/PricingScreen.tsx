'use client';

import { useTranslations } from 'next-intl';
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
    sub => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
  );

  const handleSubscribe = async (priceId: string) => {
    setProcessingPriceId(priceId);
    try {
      if (activeSubscription) {
        await switchMutation.mutateAsync({
          param: { id: activeSubscription.id },
          json: { newPriceId: priceId },
        });
      } else {
        const result = await createCheckoutMutation.mutateAsync({
          json: { priceId },
        });

        if (result.success && result.data?.url) {
          window.location.href = result.data.url;
        }
      }
    } catch (err) {
      console.error('Subscription error:', err);
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
    } catch (err) {
      console.error('Cancel error:', err);
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
    } catch (err) {
      console.error('Customer portal error:', err);
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
