import { StripeSubscriptionStatuses, SubscriptionChangeTypes } from '@roundtable/shared';
import { useNavigate } from '@tanstack/react-router';
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
import { useTranslations } from '@/lib/i18n';
import { toastManager } from '@/lib/toast';
import { getApiErrorMessage } from '@/lib/utils';
import type { Product } from '@/services/api/billing/products';
import type { Subscription } from '@/services/api/billing/subscriptions';

export default function PricingScreen() {
  const navigate = useNavigate();
  const t = useTranslations();
  const [processingPriceId, setProcessingPriceId] = useState<string | null>(null);
  const [cancelingSubscriptionId, setCancelingSubscriptionId] = useState<string | null>(null);
  const [isManagingBilling, setIsManagingBilling] = useState(false);

  const { data: productsData, error: productsError } = useProductsQuery();
  const { data: subscriptionsData } = useSubscriptionsQuery();

  const createCheckoutMutation = useCreateCheckoutSessionMutation();
  const cancelMutation = useCancelSubscriptionMutation();
  const switchMutation = useSwitchSubscriptionMutation();
  const customerPortalMutation = useCreateCustomerPortalSessionMutation();

  type ApiResponse<T> = { success: boolean; data?: T };

  const typedProductsData = productsData as ApiResponse<{ items?: Product[] }> | undefined;
  const typedSubscriptionsData = subscriptionsData as ApiResponse<{ items?: Subscription[] }> | undefined;

  const products = typedProductsData?.success ? typedProductsData.data?.items ?? [] : [];
  const subscriptions: Subscription[] = typedSubscriptionsData?.success ? typedSubscriptionsData.data?.items ?? [] : [];

  const shouldShowError = productsError || (typedProductsData && !typedProductsData.success);

  const activeSubscription: Subscription | undefined = subscriptions.find(
    sub => (sub.status === StripeSubscriptionStatuses.ACTIVE || sub.status === StripeSubscriptionStatuses.TRIALING) && !sub.cancelAtPeriodEnd,
  );

  const handleSubscribe = async (priceId: string) => {
    setProcessingPriceId(priceId);
    try {
      if (activeSubscription) {
        const result = await switchMutation.mutateAsync({
          param: { id: activeSubscription.id },
          json: { newPriceId: priceId },
        }) as ApiResponse<{
          changeDetails?: {
            isUpgrade: boolean;
            isDowngrade: boolean;
            oldPrice: { productId: string };
            newPrice: { productId: string };
          };
        }> | undefined;

        if (result?.success) {
          const changeDetails = result.data?.changeDetails;

          if (changeDetails) {
            const changeType = changeDetails.isUpgrade
              ? SubscriptionChangeTypes.UPGRADE
              : changeDetails.isDowngrade
                ? SubscriptionChangeTypes.DOWNGRADE
                : SubscriptionChangeTypes.CHANGE;

            // ✅ Use TanStack Router search option for type-safe query params
            navigate({
              to: '/chat/billing/subscription-changed',
              search: {
                changeType,
                oldProductId: changeDetails.oldPrice.productId,
                newProductId: changeDetails.newPrice.productId,
              },
              replace: true,
            });
          } else {
            navigate({ to: '/chat/billing/subscription-changed', replace: true });
          }
        }
      } else {
        const result = await createCheckoutMutation.mutateAsync({
          json: { priceId },
        }) as ApiResponse<{ url?: string }> | undefined;

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
      const result = await customerPortalMutation.mutateAsync({
        json: {
          returnUrl: window.location.href,
        },
      }) as ApiResponse<{ url?: string }> | undefined;

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
