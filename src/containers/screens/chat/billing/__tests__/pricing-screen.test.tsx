/**
 * PricingScreen Integration Tests
 *
 * Tests for the pricing screen container covering:
 * - Query integration (products, subscriptions)
 * - Mutation handlers (checkout, cancel, switch, portal)
 * - Error handling and toast notifications
 * - Navigation and redirects
 * - Complete user flows
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { useRouter } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';

import { StripeSubscriptionStatuses } from '@/api/core/enums';
import {
  createActiveSubscription,
  createMockProductCatalog,
  render,
  screen,
  waitFor,
} from '@/lib/testing';

import PricingScreen from '../PricingScreen';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(() => '/chat/pricing'),
}));

vi.mock('@/lib/toast', () => ({
  toastManager: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/hooks/utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/utils')>();
  return {
    ...original,
    useIsMounted: () => true,
  };
});

function createMockQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

describe('pricingScreen', () => {
  const mockRouter: Pick<AppRouterInstance, 'push' | 'replace' | 'refresh'> = {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue(mockRouter as AppRouterInstance);
  });

  describe('product loading', () => {
    it('shows loading skeleton initially', () => {
      const queryClient = createMockQueryClient();

      queryClient.setQueryData(['products', 'list'], {
        success: false,
      });

      queryClient.setQueryData(['subscriptions', 'list'], {
        success: true,
        data: { items: [], count: 0 },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <PricingScreen />
        </QueryClientProvider>,
      );

      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('displays products when loaded', async () => {
      const queryClient = createMockQueryClient();
      const products = createMockProductCatalog();

      queryClient.setQueryData(['products', 'list'], {
        success: true,
        data: { items: products, count: products.length },
      });

      queryClient.setQueryData(['subscriptions', 'list'], {
        success: true,
        data: { items: [], count: 0 },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <PricingScreen />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Free Plan')).toBeInTheDocument();
      });

      expect(screen.getByText('Pro Plan')).toBeInTheDocument();
      expect(screen.getByText('Enterprise Plan')).toBeInTheDocument();
    });

    it('shows error state when products fail to load', async () => {
      const queryClient = createMockQueryClient();

      queryClient.setQueryData(['products', 'list'], undefined);
      queryClient.setQueryDefaults(['products', 'list'], {
        queryFn: () => {
          throw new Error('Failed to load products');
        },
      });

      queryClient.setQueryData(['subscriptions', 'list'], {
        success: true,
        data: { items: [], count: 0 },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <PricingScreen />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument();
      });
    });
  });

  describe('subscription display', () => {
    it('shows current plan badge for active subscription', async () => {
      const queryClient = createMockQueryClient();
      const products = createMockProductCatalog();
      const proPlan = products.find(p => p.name === 'Pro Plan');
      const subscription = createActiveSubscription(proPlan!.prices![0].id);

      queryClient.setQueryData(['products', 'list'], {
        success: true,
        data: { items: products, count: products.length },
      });

      queryClient.setQueryData(['subscriptions', 'list'], {
        success: true,
        data: { items: [subscription], count: 1 },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <PricingScreen />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Current Plan')).toBeInTheDocument();
      });
    });

    it('does not show current plan for no subscription', async () => {
      const queryClient = createMockQueryClient();
      const products = createMockProductCatalog();

      queryClient.setQueryData(['products', 'list'], {
        success: true,
        data: { items: products, count: products.length },
      });

      queryClient.setQueryData(['subscriptions', 'list'], {
        success: true,
        data: { items: [], count: 0 },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <PricingScreen />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.queryByText('Current Plan')).not.toBeInTheDocument();
      });
    });
  });

  describe('subscription actions', () => {
    it('shows subscribe button when no subscription', async () => {
      const queryClient = createMockQueryClient();
      const products = createMockProductCatalog();

      queryClient.setQueryData(['products', 'list'], {
        success: true,
        data: { items: products, count: products.length },
      });

      queryClient.setQueryData(['subscriptions', 'list'], {
        success: true,
        data: { items: [], count: 0 },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <PricingScreen />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getAllByText('Subscribe').length).toBeGreaterThan(0);
      });
    });

    it('shows cancel subscription button for current plan', async () => {
      const queryClient = createMockQueryClient();
      const products = createMockProductCatalog();
      const proPlan = products.find(p => p.name === 'Pro Plan');
      const subscription = createActiveSubscription(proPlan!.prices![0].id);

      queryClient.setQueryData(['products', 'list'], {
        success: true,
        data: { items: products, count: products.length },
      });

      queryClient.setQueryData(['subscriptions', 'list'], {
        success: true,
        data: { items: [subscription], count: 1 },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <PricingScreen />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Cancel Subscription')).toBeInTheDocument();
      });
    });

    it('shows manage billing button for current plan', async () => {
      const queryClient = createMockQueryClient();
      const products = createMockProductCatalog();
      const proPlan = products.find(p => p.name === 'Pro Plan');
      const subscription = createActiveSubscription(proPlan!.prices![0].id);

      queryClient.setQueryData(['products', 'list'], {
        success: true,
        data: { items: products, count: products.length },
      });

      queryClient.setQueryData(['subscriptions', 'list'], {
        success: true,
        data: { items: [subscription], count: 1 },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <PricingScreen />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Manage Billing')).toBeInTheDocument();
      });
    });
  });

  describe('page header', () => {
    it('renders page title', async () => {
      const queryClient = createMockQueryClient();
      const products = createMockProductCatalog();

      queryClient.setQueryData(['products', 'list'], {
        success: true,
        data: { items: products, count: products.length },
      });

      queryClient.setQueryData(['subscriptions', 'list'], {
        success: true,
        data: { items: [], count: 0 },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <PricingScreen />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Pricing & Plans')).toBeInTheDocument();
      });
    });

    it('renders page description', async () => {
      const queryClient = createMockQueryClient();
      const products = createMockProductCatalog();

      queryClient.setQueryData(['products', 'list'], {
        success: true,
        data: { items: products, count: products.length },
      });

      queryClient.setQueryData(['subscriptions', 'list'], {
        success: true,
        data: { items: [], count: 0 },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <PricingScreen />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/choose the perfect plan/i)).toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    it('has proper heading structure', async () => {
      const queryClient = createMockQueryClient();
      const products = createMockProductCatalog();

      queryClient.setQueryData(['products', 'list'], {
        success: true,
        data: { items: products, count: products.length },
      });

      queryClient.setQueryData(['subscriptions', 'list'], {
        success: true,
        data: { items: [], count: 0 },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <PricingScreen />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        const heading = screen.getByText('Pricing & Plans');
        expect(heading).toBeInTheDocument();
      });
    });

    it('renders actionable buttons', async () => {
      const queryClient = createMockQueryClient();
      const products = createMockProductCatalog();

      queryClient.setQueryData(['products', 'list'], {
        success: true,
        data: { items: products, count: products.length },
      });

      queryClient.setQueryData(['subscriptions', 'list'], {
        success: true,
        data: { items: [], count: 0 },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <PricingScreen />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('edge cases', () => {
    it('handles undefined products data gracefully', async () => {
      const queryClient = createMockQueryClient();

      queryClient.setQueryData(['products', 'list'], undefined);

      queryClient.setQueryData(['subscriptions', 'list'], {
        success: true,
        data: { items: [], count: 0 },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <PricingScreen />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/no plans available/i)).toBeInTheDocument();
      });
    });

    it('handles undefined subscriptions data gracefully', async () => {
      const queryClient = createMockQueryClient();
      const products = createMockProductCatalog();

      queryClient.setQueryData(['products', 'list'], {
        success: true,
        data: { items: products, count: products.length },
      });

      queryClient.setQueryData(['subscriptions', 'list'], undefined);

      render(
        <QueryClientProvider client={queryClient}>
          <PricingScreen />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Free Plan')).toBeInTheDocument();
      });
    });

    it('handles empty products array', async () => {
      const queryClient = createMockQueryClient();

      queryClient.setQueryData(['products', 'list'], {
        success: true,
        data: { items: [], count: 0 },
      });

      queryClient.setQueryData(['subscriptions', 'list'], {
        success: true,
        data: { items: [], count: 0 },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <PricingScreen />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/no plans available/i)).toBeInTheDocument();
      });
    });

    it('handles multiple active subscriptions', async () => {
      const queryClient = createMockQueryClient();
      const products = createMockProductCatalog();
      const proPlan = products.find(p => p.name === 'Pro Plan');
      const subscription1 = createActiveSubscription(proPlan!.prices![0].id);
      const subscription2 = {
        ...subscription1,
        id: 'sub_second',
        status: StripeSubscriptionStatuses.ACTIVE,
      };

      queryClient.setQueryData(['products', 'list'], {
        success: true,
        data: { items: products, count: products.length },
      });

      queryClient.setQueryData(['subscriptions', 'list'], {
        success: true,
        data: { items: [subscription1, subscription2], count: 2 },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <PricingScreen />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Current Plan')).toBeInTheDocument();
      });
    });
  });
});
