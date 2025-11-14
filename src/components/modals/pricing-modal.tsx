'use client';

import { useTranslations } from 'next-intl';

import type { Product } from '@/api/routes/billing/schema';
import { PricingContent } from '@/components/pricing/pricing-content';
import type { Subscription } from '@/types/billing';

import { BaseModal } from './base-modal';

type PricingModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  subscriptions: Subscription[];
  isLoading?: boolean;
  processingPriceId: string | null;
  cancelingSubscriptionId: string | null;
  isManagingBilling: boolean;
  onSubscribe: (priceId: string) => Promise<void>;
  onCancel: (subscriptionId: string) => Promise<void>;
  onManageBilling: () => void;
};

/**
 * Pricing Modal Component
 *
 * Displays available products with pricing and subscription management in a modal dialog.
 * Uses the shared PricingContent component to ensure consistency with the standalone pricing page.
 *
 * @param props - Component props
 * @param props.open - Controls modal visibility
 * @param props.onOpenChange - Callback when modal visibility changes
 * @param props.products - Array of available products
 * @param props.subscriptions - Array of user subscriptions
 * @param props.isLoading - Loading state for products
 * @param props.processingPriceId - Price ID being processed
 * @param props.onSubscribe - Callback when user subscribes to a product
 * @param props.onCancel - Callback when user cancels a subscription
 * @param props.onManageBilling - Callback to open Stripe customer portal
 * @param props.cancelingSubscriptionId - ID of subscription being canceled
 * @param props.isManagingBilling - Whether currently managing billing
 */
export function PricingModal({
  open,
  onOpenChange,
  products,
  subscriptions,
  isLoading,
  processingPriceId,
  cancelingSubscriptionId,
  isManagingBilling,
  onSubscribe,
  onCancel,
  onManageBilling,
}: PricingModalProps) {
  const t = useTranslations();

  return (
    <BaseModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('pricing.modal.title')}
      description={t('pricing.modal.description')}
      size="xl"
      useScrollArea
      scrollAreaHeight="60vh"
    >
      <PricingContent
        products={products}
        subscriptions={subscriptions}
        isLoading={isLoading}
        error={null}
        processingPriceId={processingPriceId}
        cancelingSubscriptionId={cancelingSubscriptionId}
        isManagingBilling={isManagingBilling}
        onSubscribe={onSubscribe}
        onCancel={onCancel}
        onManageBilling={onManageBilling}
        showSubscriptionBanner={false}
        isModal
      />
    </BaseModal>
  );
}
