/**
 * PricingCard Component Tests
 *
 * Tests for the pricing card component covering:
 * - Basic rendering with required props
 * - Price formatting and display
 * - Fixed value props rendering
 * - Button states and actions
 * - Loading states
 * - Badge displays (current plan)
 *
 * Note: Component uses fixed value props instead of custom features/description
 */

import { UIBillingIntervals } from '@roundtable/shared';
import { describe, expect, it, vi } from 'vitest';

import { render, screen, userEvent } from '@/lib/testing';

import { PricingCard } from '../pricing-card';

describe('pricingCard', () => {
  describe('basic rendering', () => {
    it('renders with required props', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
            interval: UIBillingIntervals.MONTH,
          }}
        />,
      );

      expect(screen.getByText('Pro Plan')).toBeInTheDocument();
    });

    it('renders fixed value props instead of custom description', () => {
      render(
        <PricingCard
          name="Pro Plan"
          description="This description is not displayed"
          price={{
            amount: 1999,
            currency: 'usd',
            interval: UIBillingIntervals.MONTH,
          }}
        />,
      );

      // Component shows fixed value props, not custom description
      expect(screen.getByText('All AI Models')).toBeInTheDocument();
      expect(screen.getByText('Unlimited Messages')).toBeInTheDocument();
    });
  });

  describe('price formatting', () => {
    it('formats price correctly in USD', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
            interval: UIBillingIntervals.MONTH,
          }}
        />,
      );

      expect(screen.getByText('$20')).toBeInTheDocument();
    });

    it('displays interval when provided', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
            interval: UIBillingIntervals.MONTH,
          }}
        />,
      );

      expect(screen.getByText('/month')).toBeInTheDocument();
    });

    it('does not display interval when null', () => {
      render(
        <PricingCard
          name="Credits Pack"
          price={{
            amount: 500,
            currency: 'usd',
            interval: null,
          }}
        />,
      );

      expect(screen.queryByText('/month')).not.toBeInTheDocument();
    });

    it('formats free plan correctly', () => {
      render(
        <PricingCard
          name="Free Plan"
          price={{
            amount: 0,
            currency: 'usd',
            interval: UIBillingIntervals.MONTH,
          }}
        />,
      );

      expect(screen.getByText('$0')).toBeInTheDocument();
    });

    it('handles different currencies', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'eur',
            interval: UIBillingIntervals.MONTH,
          }}
        />,
      );

      expect(screen.getByText('€20')).toBeInTheDocument();
    });
  });

  describe('value props rendering', () => {
    it('renders all fixed value props', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
            interval: UIBillingIntervals.MONTH,
          }}
        />,
      );

      // Fixed value props from component
      expect(screen.getByText('All AI Models')).toBeInTheDocument();
      expect(screen.getByText('Presets & Custom')).toBeInTheDocument();
      expect(screen.getByText('Unlimited Messages')).toBeInTheDocument();
      expect(screen.getByText('Council Summary')).toBeInTheDocument();
    });

    it('renders value prop descriptions', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
            interval: UIBillingIntervals.MONTH,
          }}
        />,
      );

      expect(screen.getByText('Access GPT, Claude, Gemini & more')).toBeInTheDocument();
      expect(screen.getByText('No caps, no limits, just chat')).toBeInTheDocument();
    });

    it('renders list element for value props', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
        />,
      );

      expect(screen.getByRole('list')).toBeInTheDocument();
    });
  });

  describe('badge displays', () => {
    it('uses glowing effect when isMostPopular is true', () => {
      const { container } = render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          isMostPopular={true}
        />,
      );

      // Component uses GlowingEffect component, not text badge
      // The glow effect is controlled by isMostPopular && !isCurrentPlan
      expect(container.querySelector('.glow')).toBeInTheDocument();
    });

    it('does not show "Most Popular" text badge', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          isMostPopular={true}
        />,
      );

      // Component removed text badge in favor of glowing effect
      expect(screen.queryByText('Most Popular')).not.toBeInTheDocument();
    });

    it('shows "Current Plan" badge when isCurrentPlan is true', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          isCurrentPlan={true}
        />,
      );

      expect(screen.getByText('Current Plan')).toBeInTheDocument();
    });

    it('shows current plan badge with check icon', () => {
      const { container } = render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          isCurrentPlan={true}
        />,
      );

      expect(screen.getByText('Current Plan')).toBeInTheDocument();
      // Check icon is rendered alongside the badge
      expect(container.querySelector('.lucide-check')).toBeInTheDocument();
    });
  });

  describe('button states and actions', () => {
    it('shows "Get Started" button by default', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          onSubscribe={vi.fn()}
        />,
      );

      expect(screen.getByText('Get Started')).toBeInTheDocument();
    });

    it('shows "Switch to This Plan" when user has other subscription', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          hasOtherSubscription={true}
          onSubscribe={vi.fn()}
        />,
      );

      expect(screen.getByText('Switch to This Plan')).toBeInTheDocument();
    });

    it('shows "Cancel Subscription" when this is current plan', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          isCurrentPlan={true}
          onCancel={vi.fn()}
        />,
      );

      expect(screen.getByText('Cancel Subscription')).toBeInTheDocument();
    });

    it('calls onSubscribe when get started button clicked', async () => {
      const user = userEvent.setup();
      const handleSubscribe = vi.fn();

      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          onSubscribe={handleSubscribe}
        />,
      );

      await user.click(screen.getByText('Get Started'));
      expect(handleSubscribe).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when cancel button clicked on current plan', async () => {
      const user = userEvent.setup();
      const handleCancel = vi.fn();

      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          isCurrentPlan={true}
          onCancel={handleCancel}
        />,
      );

      await user.click(screen.getByText('Cancel Subscription'));
      expect(handleCancel).toHaveBeenCalledTimes(1);
    });

    it('shows "Manage Billing" button when current plan and handler provided', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          isCurrentPlan={true}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.getByText('Manage Billing')).toBeInTheDocument();
    });

    it('calls onManageBilling when manage billing button clicked', async () => {
      const user = userEvent.setup();
      const handleManageBilling = vi.fn();

      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          isCurrentPlan={true}
          onManageBilling={handleManageBilling}
        />,
      );

      await user.click(screen.getByText('Manage Billing'));
      expect(handleManageBilling).toHaveBeenCalledTimes(1);
    });

    it('disables button when disabled prop is true', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          onSubscribe={vi.fn()}
          disabled={true}
        />,
      );

      const button = screen.getByText('Get Started').closest('button');
      expect(button).toBeDisabled();
    });
  });

  describe('loading states', () => {
    it('shows processing state when subscribing', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          isProcessingSubscribe={true}
          onSubscribe={vi.fn()}
        />,
      );

      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    it('shows processing state when canceling', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          isCurrentPlan={true}
          isProcessingCancel={true}
          onCancel={vi.fn()}
        />,
      );

      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    it('shows processing state when managing billing', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          isCurrentPlan={true}
          isProcessingManageBilling={true}
          onManageBilling={vi.fn()}
        />,
      );

      expect(screen.getAllByText('Processing...').length).toBeGreaterThan(0);
    });

    it('disables buttons during processing', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          isProcessingSubscribe={true}
          onSubscribe={vi.fn()}
        />,
      );

      const button = screen.getByText('Processing...').closest('button');
      expect(button).toBeDisabled();
    });
  });

  describe('accessibility', () => {
    it('renders with proper button roles', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          onSubscribe={vi.fn()}
        />,
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('has accessible button text', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          onSubscribe={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();
    });
  });
});
