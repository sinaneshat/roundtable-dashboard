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

import { useRouter } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';

import { StripeSubscriptionStatuses, UIBillingIntervals } from '@/api/core/enums';
import {
  createActiveSubscription,
  createCancelingSubscription,
  createMockPrice,
  createMockProduct,
  createMockProductCatalog,
  createTrialingSubscription,
  render,
  screen,
  userEvent,
  waitFor,
} from '@/lib/testing';

import { PricingContent } from '../pricing-content';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(() => '/chat/pricing'),
}));

vi.mock('@/hooks/utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/utils')>();
  return {
    ...original,
    useIsMounted: () => true,
  };
});

describe('pricingContent', () => {
  const mockRouter = {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue(mockRouter as any);
  });

  describe('loading state', () => {
    it('shows skeleton when loading', () => {
      render(
        <PricingContent
          products={[]}
          subscriptions={[]}
          isLoading={true}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      // Skeleton should have specific structure
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not show products during loading', () => {
      const products = createMockProductCatalog();

      render(
        <PricingContent
          products={products}
          subscriptions={[]}
          isLoading={true}
          processingPriceId={null}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.queryByText('Pro Plan')).not.toBeInTheDocument();
    });
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

      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    it('shows retry button in error state', () => {
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

      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('calls router.refresh when retry button clicked', async () => {
      const user = userEvent.setup();
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

      await user.click(screen.getByRole('button', { name: /retry/i }));
      expect(mockRouter.refresh).toHaveBeenCalled();
    });
  });

  describe('product filtering', () => {
    it('shows only monthly products', () => {
      const monthlyProduct = createMockProduct({
        name: 'Monthly Pro',
        prices: [
          createMockPrice({
            interval: UIBillingIntervals.MONTH,
          }),
        ],
      });

      const yearlyProduct = createMockProduct({
        name: 'Yearly Pro',
        prices: [
          createMockPrice({
            interval: UIBillingIntervals.YEAR,
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
        name: 'Yearly Only',
        prices: [
          createMockPrice({
            interval: UIBillingIntervals.YEAR,
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
        prices: [
          createMockPrice({
            interval: UIBillingIntervals.YEAR,
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

      expect(screen.getByText(/no plans available/i)).toBeInTheDocument();
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
        name: 'Test Plan',
        description: 'Test description',
        features: ['Feature 1', 'Feature 2'],
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

      expect(screen.getByText('Test Plan')).toBeInTheDocument();
      expect(screen.getByText('Test description')).toBeInTheDocument();
      expect(screen.getByText('Feature 1')).toBeInTheDocument();
      expect(screen.getByText('Feature 2')).toBeInTheDocument();
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

      expect(screen.getByText('Current Plan')).toBeInTheDocument();
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

      expect(screen.getByText('Current Plan')).toBeInTheDocument();
    });

    it('does not show current plan for canceled subscription', () => {
      const product = createMockProduct({
        name: 'Pro Plan',
        prices: [createMockPrice({ id: 'price_pro' })],
      });
      const subscription = {
        id: 'sub_canceled',
        priceId: 'price_pro',
        status: StripeSubscriptionStatuses.CANCELED,
        cancelAtPeriodEnd: false,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date().toISOString(),
        canceledAt: new Date().toISOString(),
        trialStart: null,
        trialEnd: null,
        price: { productId: 'prod_test' },
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

      expect(screen.queryByText('Current Plan')).not.toBeInTheDocument();
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

      expect(screen.queryByText('Current Plan')).not.toBeInTheDocument();
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
          showSubscriptionBanner={true}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.getByText(/current plan/i)).toBeInTheDocument();
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
          showSubscriptionBanner={true}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.queryByText(/renewsOn/i)).not.toBeInTheDocument();
    });
  });

  describe('user interactions', () => {
    it('calls onSubscribe when subscribe button clicked', async () => {
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

      await user.click(screen.getByText('Subscribe'));
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

      await user.click(screen.getByText('Cancel Subscription'));
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

      await user.click(screen.getByText('Manage Billing'));
      expect(handleManageBilling).toHaveBeenCalled();
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

      expect(screen.getByText('Processing...')).toBeInTheDocument();
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

      expect(screen.getByText('Processing...')).toBeInTheDocument();
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
          isManagingBilling={true}
          onSubscribe={vi.fn()}
          onCancel={vi.fn()}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.getAllByText('Processing...').length).toBeGreaterThan(0);
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
            id: 'price_invalid',
            productId: 'prod_test',
            unitAmount: null as any,
            currency: 'usd',
            interval: UIBillingIntervals.MONTH,
            trialPeriodDays: null,
            active: true,
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

      expect(screen.getByText(/no plans available/i)).toBeInTheDocument();
    });
  });
});
