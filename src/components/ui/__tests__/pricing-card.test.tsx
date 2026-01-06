/**
 * PricingCard Component Tests
 *
 * Tests for the pricing card component covering:
 * - Basic rendering with required props
 * - Price formatting and display
 * - Feature list rendering
 * - Trial period display
 * - Button states and actions
 * - Loading states
 * - Badge displays (current plan, most popular)
 */

import { describe, expect, it, vi } from 'vitest';

import { UIBillingIntervals } from '@/api/core/enums';
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

    it('renders description when provided', () => {
      render(
        <PricingCard
          name="Pro Plan"
          description="Professional features for power users"
          price={{
            amount: 1999,
            currency: 'usd',
            interval: UIBillingIntervals.MONTH,
          }}
        />,
      );

      expect(screen.getByText('Professional features for power users')).toBeInTheDocument();
    });

    it('does not render description when null', () => {
      render(
        <PricingCard
          name="Pro Plan"
          description={null}
          price={{
            amount: 1999,
            currency: 'usd',
          }}
        />,
      );

      expect(screen.queryByText(/Professional features/)).not.toBeInTheDocument();
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

      expect(screen.getByText('USD 19.99')).toBeInTheDocument();
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

      expect(screen.getByText('USD 0.00')).toBeInTheDocument();
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

      expect(screen.getByText('EUR 19.99')).toBeInTheDocument();
    });
  });

  describe('trial period display', () => {
    it('displays trial badge when trial days provided', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
            interval: UIBillingIntervals.MONTH,
            trialDays: 14,
          }}
        />,
      );

      expect(screen.getByText(/14/)).toBeInTheDocument();
      expect(screen.getByText(/days free trial/)).toBeInTheDocument();
    });

    it('does not display trial badge when trial days is null', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
            interval: UIBillingIntervals.MONTH,
            trialDays: null,
          }}
        />,
      );

      expect(screen.queryByText(/days free trial/)).not.toBeInTheDocument();
    });

    it('does not display trial badge when trial days is 0', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
            interval: UIBillingIntervals.MONTH,
            trialDays: 0,
          }}
        />,
      );

      expect(screen.queryByText(/days free trial/)).not.toBeInTheDocument();
    });
  });

  describe('feature list rendering', () => {
    it('renders all features when provided', () => {
      const features = [
        'Unlimited AI conversations',
        'Access to all models',
        'Priority support',
        'Advanced analytics',
      ];

      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
            interval: UIBillingIntervals.MONTH,
          }}
          features={features}
        />,
      );

      features.forEach((feature) => {
        expect(screen.getByText(feature)).toBeInTheDocument();
      });
    });

    it('does not render feature list when null', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          features={null}
        />,
      );

      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('does not render feature list when empty array', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          features={[]}
        />,
      );

      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });
  });

  describe('badge displays', () => {
    it('shows "Most Popular" badge when isMostPopular is true', () => {
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

      expect(screen.getByText('Most Popular')).toBeInTheDocument();
    });

    it('does not show "Most Popular" badge when isMostPopular is false', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          isMostPopular={false}
        />,
      );

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

    it('shows both badges when both are true', () => {
      render(
        <PricingCard
          name="Pro Plan"
          price={{
            amount: 1999,
            currency: 'usd',
          }}
          isCurrentPlan={true}
          isMostPopular={true}
        />,
      );

      expect(screen.getByText('Current Plan')).toBeInTheDocument();
      expect(screen.getByText('Most Popular')).toBeInTheDocument();
    });
  });

  describe('button states and actions', () => {
    it('shows "Subscribe" button by default', () => {
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

      expect(screen.getByText('Subscribe')).toBeInTheDocument();
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

    it('calls onSubscribe when subscribe button clicked', async () => {
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

      await user.click(screen.getByText('Subscribe'));
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

      const button = screen.getByText('Subscribe').closest('button');
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

      expect(screen.getByRole('button', { name: /subscribe/i })).toBeInTheDocument();
    });
  });
});
