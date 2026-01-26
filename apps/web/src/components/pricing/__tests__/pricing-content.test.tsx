/**
 * PricingContent Component Tests
 *
 * Tests for the pricing content container component covering:
 * - Product filtering (monthly plans)
 * - Subscription state management
 * - Loading and error states
 * - Empty states
 * - User interaction handlers
 * - Subscription banner display
 */

import { BillingIntervals, StripeSubscriptionStatuses, UIBillingIntervals } from '@roundtable/shared';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  createActiveSubscription,
  createCancelingSubscription,
  createMockPrice,
  createMockProduct,
  createMockProductCatalog,
  createTrialingSubscription,
  render,
  screen,
} from '@/lib/testing';

import { PricingContent } from '../pricing-content';

vi.mock('@/lib/i18n', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/i18n')>();
  return {
    ...original,
    useTranslations: vi.fn(() => (key: string) => key),
  };
});

vi.mock('@/hooks/utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/utils')>();
  return {
    ...original,
    useIsMounted: () => true,
  };
});

describe('pricingContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('error state', () => {
    it('shows error message when error prop provided', () => {
      const error = new Error('Failed to load products');

      render(
        <PricingContent
          products={[]}
          subscriptions={[]}
          error={error}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.getByText('plans.error')).toBeInTheDocument();
    });

    it('shows try again button in error state', () => {
      const error = new Error('Failed to load products');

      render(
        <PricingContent
          products={[]}
          subscriptions={[]}
          error={error}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: 'actions.tryAgain' })).toBeInTheDocument();
    });

    it('calls window.location.reload when try again button clicked', async () => {
      const user = userEvent.setup();
      const error = new Error('Failed to load products');
      const mockReload = vi.fn();
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        value: { ...originalLocation, reload: mockReload },
        writable: true,
      });

      render(
        <PricingContent
          products={[]}
          subscriptions={[]}
          error={error}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'actions.tryAgain' }));
      expect(mockReload).toHaveBeenCalledWith();

      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
      });
    });
  });

  describe('product filtering', () => {
    it('shows only monthly products', () => {
      const monthlyProduct = createMockProduct({
        id: 'prod_monthly',
        name: 'Monthly Pro',
        prices: [
          createMockPrice({
            id: 'price_monthly',
            interval: UIBillingIntervals.MONTH,
            productId: 'prod_monthly',
          }),
        ],
      });

      const yearlyProduct = createMockProduct({
        id: 'prod_yearly',
        name: 'Yearly Pro',
        prices: [
          createMockPrice({
            id: 'price_yearly',
            interval: BillingIntervals.YEAR,
            productId: 'prod_yearly',
          }),
        ],
      });

      render(
        <PricingContent
          products={[monthlyProduct, yearlyProduct]}
          subscriptions={[]}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.getByText('Monthly Pro')).toBeInTheDocument();
      expect(screen.queryByText('Yearly Pro')).not.toBeInTheDocument();
    });

    it('filters out products with no monthly prices', () => {
      const productWithOnlyYearly = createMockProduct({
        id: 'prod_yearly_only',
        name: 'Yearly Only',
        prices: [
          createMockPrice({
            id: 'price_yearly_only',
            interval: BillingIntervals.YEAR,
            productId: 'prod_yearly_only',
          }),
        ],
      });

      render(
        <PricingContent
          products={[productWithOnlyYearly]}
          subscriptions={[]}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.queryByText('Yearly Only')).not.toBeInTheDocument();
    });

    it('shows message when no monthly products available', () => {
      const yearlyProduct = createMockProduct({
        id: 'prod_yearly_only',
        prices: [
          createMockPrice({
            id: 'price_yearly_only',
            interval: BillingIntervals.YEAR,
            productId: 'prod_yearly_only',
          }),
        ],
      });

      render(
        <PricingContent
          products={[yearlyProduct]}
          subscriptions={[]}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.getByText('plans.noPlansAvailable')).toBeInTheDocument();
    });
  });

  describe('product rendering', () => {
    it('renders all monthly products', () => {
      const products = createMockProductCatalog();

      render(
        <PricingContent
          products={products}
          subscriptions={[]}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.getByText('Free Plan')).toBeInTheDocument();
      expect(screen.getByText('Pro Plan')).toBeInTheDocument();
      expect(screen.getByText('Enterprise Plan')).toBeInTheDocument();
    });

    it('passes correct props to pricing cards', () => {
      const product = createMockProduct({
        description: 'Test description',
        features: ['Feature 1', 'Feature 2'],
        name: 'Test Plan',
      });

      render(
        <PricingContent
          products={[product]}
          subscriptions={[]}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      // PricingCard now uses fixed value props with translation keys
      expect(screen.getByText('Test Plan')).toBeInTheDocument();
      expect(screen.getByText('pricing.card.valueProps.allModels.title')).toBeInTheDocument();
      expect(screen.getByText('pricing.card.valueProps.unlimited.title')).toBeInTheDocument();
    });
  });

  describe('subscription state management', () => {
    it('identifies active subscription correctly', () => {
      const product = createMockProduct({
        name: 'Pro Plan',
        prices: [createMockPrice({ id: 'price_pro' })],
      });
      const subscription = createActiveSubscription('price_pro');

      render(
        <PricingContent
          products={[product]}
          subscriptions={[subscription]}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.getByText('pricing.card.currentPlan')).toBeInTheDocument();
    });

    it('identifies trialing subscription as active', () => {
      const product = createMockProduct({
        name: 'Pro Plan',
        prices: [createMockPrice({ id: 'price_pro' })],
      });
      const subscription = createTrialingSubscription('price_pro');

      render(
        <PricingContent
          products={[product]}
          subscriptions={[subscription]}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.getByText('pricing.card.currentPlan')).toBeInTheDocument();
    });

    it('does not show current plan for canceled subscription', () => {
      const product = createMockProduct({
        name: 'Pro Plan',
        prices: [createMockPrice({ id: 'price_pro' })],
      });
      const subscription = {
        cancelAtPeriodEnd: false,
        canceledAt: new Date().toISOString(),
        currentPeriodEnd: new Date().toISOString(),
        currentPeriodStart: new Date().toISOString(),
        id: 'sub_canceled',
        price: { productId: 'prod_test' },
        priceId: 'price_pro',
        status: StripeSubscriptionStatuses.CANCELED,
        trialEnd: null,
        trialStart: null,
      };

      render(
        <PricingContent
          products={[product]}
          subscriptions={[subscription]}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.queryByText('pricing.card.currentPlan')).not.toBeInTheDocument();
    });

    it('does not show current plan for subscription marked for cancellation', () => {
      const product = createMockProduct({
        name: 'Pro Plan',
        prices: [createMockPrice({ id: 'price_pro' })],
      });
      const subscription = createCancelingSubscription('price_pro');

      render(
        <PricingContent
          products={[product]}
          subscriptions={[subscription]}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.queryByText('pricing.card.currentPlan')).not.toBeInTheDocument();
    });
  });

  describe('subscription banner', () => {
    it('shows subscription banner when enabled and has active subscription', () => {
      const product = createMockProduct({
        prices: [createMockPrice({ id: 'price_pro' })],
      });
      const subscription = createActiveSubscription('price_pro');

      render(
        <PricingContent
          products={[product]}
          subscriptions={[subscription]}
          processingPriceId={null}
          showSubscriptionBanner
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.getByText('billing.currentPlan')).toBeInTheDocument();
    });

    it('does not show banner when disabled', () => {
      const product = createMockProduct({
        prices: [createMockPrice({ id: 'price_pro' })],
      });
      const subscription = createActiveSubscription('price_pro');

      render(
        <PricingContent
          products={[product]}
          subscriptions={[subscription]}
          processingPriceId={null}
          showSubscriptionBanner={false}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.queryByText(/renewsOn/i)).not.toBeInTheDocument();
    });

    it('does not show banner when no active subscription', () => {
      const product = createMockProduct();

      render(
        <PricingContent
          products={[product]}
          subscriptions={[]}
          processingPriceId={null}
          showSubscriptionBanner
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.queryByText(/renewsOn/i)).not.toBeInTheDocument();
    });
  });

  describe('user interactions', () => {
    it('calls onSubscribe when get started button clicked', async () => {
      const user = userEvent.setup();
      const handleSubscribe = vi.fn();
      const product = createMockProduct({
        prices: [createMockPrice({ id: 'price_test' })],
      });

      render(
        <PricingContent
          products={[product]}
          subscriptions={[]}
          processingPriceId={null}
          onSubscribe={handleSubscribe}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      await user.click(screen.getByText('pricing.card.getStarted'));
      expect(handleSubscribe).toHaveBeenCalledWith('price_test');
    });

    it('calls onCancel when cancel button clicked', async () => {
      const user = userEvent.setup();
      const handleCancel = vi.fn();
      const product = createMockProduct({
        prices: [createMockPrice({ id: 'price_pro' })],
      });
      const subscription = createActiveSubscription('price_pro');

      render(
        <PricingContent
          products={[product]}
          subscriptions={[subscription]}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={handleCancel}
          onManageBilling={vi.fn()}
        />,
      );

      await user.click(screen.getByText('pricing.card.cancelSubscription'));
      expect(handleCancel).toHaveBeenCalledWith('sub_active_test');
    });

    it('calls onManageBilling when manage billing button clicked', async () => {
      const user = userEvent.setup();
      const handleManageBilling = vi.fn();
      const product = createMockProduct({
        prices: [createMockPrice({ id: 'price_pro' })],
      });
      const subscription = createActiveSubscription('price_pro');

      render(
        <PricingContent
          products={[product]}
          subscriptions={[subscription]}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={handleManageBilling}
        />,
      );

      await user.click(screen.getByText('pricing.card.manageBilling'));
      expect(handleManageBilling).toHaveBeenCalledWith();
    });
  });

  describe('processing states', () => {
    it('shows processing state for correct price', () => {
      const product = createMockProduct({
        prices: [createMockPrice({ id: 'price_processing' })],
      });

      render(
        <PricingContent
          products={[product]}
          subscriptions={[]}
          processingPriceId="price_processing"
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.getByText('pricing.card.processing')).toBeInTheDocument();
    });

    it('shows canceling state for correct subscription', () => {
      const product = createMockProduct({
        prices: [createMockPrice({ id: 'price_pro' })],
      });
      const subscription = createActiveSubscription('price_pro');

      render(
        <PricingContent
          products={[product]}
          subscriptions={[subscription]}
          processingPriceId={null}
          cancelingSubscriptionId="sub_active_test"
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.getByText('pricing.card.processing')).toBeInTheDocument();
    });

    it('shows manage billing processing state', () => {
      const product = createMockProduct({
        prices: [createMockPrice({ id: 'price_pro' })],
      });
      const subscription = createActiveSubscription('price_pro');

      render(
        <PricingContent
          products={[product]}
          subscriptions={[subscription]}
          processingPriceId={null}
          isManagingBilling
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.getAllByText('pricing.card.processing').length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('handles products with null prices', () => {
      const product = createMockProduct({
        prices: undefined,
      });

      render(
        <PricingContent
          products={[product]}
          subscriptions={[]}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.queryByText('Pro Plan')).not.toBeInTheDocument();
    });

    it('handles products with prices missing unitAmount', () => {
      const product = createMockProduct({
        prices: [
          {
            active: true,
            currency: 'usd',
            id: 'price_invalid',
            interval: UIBillingIntervals.MONTH,
            productId: 'prod_test',
            trialPeriodDays: null,
            unitAmount: null,
          },
        ],
      });

      render(
        <PricingContent
          products={[product]}
          subscriptions={[]}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.queryByText('Pro Plan')).not.toBeInTheDocument();
    });

    it('handles empty products array', () => {
      render(
        <PricingContent
          products={[]}
          subscriptions={[]}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.getByText('plans.noPlansAvailable')).toBeInTheDocument();
    });
  });
});
