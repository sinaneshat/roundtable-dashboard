'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PricingModal } from '@/components/modals/pricing-modal';
import {
  useCancelSubscriptionMutation,
  useCreateCheckoutSessionMutation,
  useCreateCustomerPortalSessionMutation,
  useProductsQuery,
  useSubscriptionsQuery,
  useSwitchSubscriptionMutation,
} from '@/hooks';

/**
 * Pricing Modal Screen
 *
 * Intercepted modal route for pricing display
 * Shown when navigating to /chat/pricing as a modal
 * Uses Next.js intercepting routes pattern with (.) prefix
 * Displays available products and pricing options
 */
export default function PricingModalScreen() {
  const router = useRouter();
  const [processingPriceId, setProcessingPriceId] = useState<string | null>(null);
  const [cancelingSubscriptionId, setCancelingSubscriptionId] = useState<string | null>(null);
  const [isManagingBilling, setIsManagingBilling] = useState(false);

  const { data: productsData, isLoading: productsLoading } = useProductsQuery();
  const { data: subscriptionsData } = useSubscriptionsQuery();

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
        // In-app subscription switch (upgrade/downgrade)
        const result = await switchMutation.mutateAsync({
          param: { id: activeSubscription.id },
          json: { newPriceId: priceId },
        });

        // ✅ Always redirect to subscription changed page after successful switch
        // Show comparison if we have changeDetails, otherwise just show new plan
        if (result.success) {
          const changeDetails = result.data?.changeDetails;

          if (changeDetails) {
            // We have before/after data - build full query params
            const changeType = changeDetails.isUpgrade ? 'upgrade' : changeDetails.isDowngrade ? 'downgrade' : 'change';

            const params = new URLSearchParams({
              changeType,
              oldProductId: changeDetails.oldPrice.productId,
              newProductId: changeDetails.newPrice.productId,
            });

            window.location.href = `/chat/billing/subscription-changed?${params.toString()}`;
          } else {
            // No changeDetails - redirect without query params (page will show just new plan)
            window.location.href = '/chat/billing/subscription-changed';
          }
        }
      } else {
        // New subscription - redirect to Stripe Checkout
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

  return (
    <PricingModal
      open
      onOpenChange={(open) => {
        if (!open)
          router.back();
      }}
      products={products}
      subscriptions={subscriptions}
      isLoading={productsLoading}
      processingPriceId={processingPriceId}
      cancelingSubscriptionId={cancelingSubscriptionId}
      isManagingBilling={isManagingBilling}
      onSubscribe={handleSubscribe}
      onCancel={handleCancel}
      onManageBilling={handleManageBilling}
    />
  );
}
