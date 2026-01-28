/**
 * PricingContentSkeleton Component Tests
 *
 * Tests for the pricing content loading skeleton covering:
 * - Skeleton structure rendering
 * - Animation presence
 * - Consistent layout with actual content
 */

import { within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { render, screen } from '@/lib/testing';

import { PricingContentSkeleton } from '../pricing-content-skeleton';

describe('pricingContentSkeleton', () => {
  describe('skeleton rendering', () => {
    it('renders skeleton structure', () => {
      render(<PricingContentSkeleton />);

      const skeleton = screen.getByTestId('pricing-skeleton');
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveClass('mx-auto');
    });

    it('renders with proper max-width layout', () => {
      render(<PricingContentSkeleton />);

      const skeleton = screen.getByTestId('pricing-skeleton');
      expect(skeleton).toHaveClass('max-w-md');
    });

    it('renders skeleton card wrapper', () => {
      render(<PricingContentSkeleton />);

      const skeleton = screen.getByTestId('pricing-skeleton');
      const cardWrapper = within(skeleton).getByTestId('pricing-skeleton').parentElement?.querySelector('.rounded-2xl');
      expect(cardWrapper || skeleton.querySelector('.rounded-2xl')).toBeInTheDocument();
    });

    it('renders skeleton card content', () => {
      render(<PricingContentSkeleton />);

      const skeleton = screen.getByTestId('pricing-skeleton');
      expect(skeleton.querySelector('.rounded-xl')).toBeInTheDocument();
    });
  });

  describe('skeleton elements', () => {
    it('renders title skeleton', () => {
      render(<PricingContentSkeleton />);

      const skeleton = screen.getByTestId('pricing-skeleton');
      const skeletons = skeleton.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders feature list skeletons', () => {
      render(<PricingContentSkeleton />);

      const skeleton = screen.getByTestId('pricing-skeleton');
      const featureItems = skeleton.querySelectorAll('.flex.items-center.gap-3');
      expect(featureItems).toHaveLength(4);
    });

    it('renders price skeleton', () => {
      render(<PricingContentSkeleton />);

      const skeleton = screen.getByTestId('pricing-skeleton');
      const priceArea = skeleton.querySelector('.flex.items-baseline.gap-1');
      expect(priceArea).toBeInTheDocument();
    });

    it('renders button skeleton', () => {
      render(<PricingContentSkeleton />);

      const skeleton = screen.getByTestId('pricing-skeleton');
      const buttonSkeleton = skeleton.querySelector('.h-11.w-full');
      expect(buttonSkeleton).toBeInTheDocument();
    });
  });

  describe('animation', () => {
    it('has pulse animation class', () => {
      render(<PricingContentSkeleton />);

      const skeleton = screen.getByTestId('pricing-skeleton');
      const animatedElements = skeleton.querySelectorAll('[class*="animate-pulse"]');
      expect(animatedElements.length).toBeGreaterThan(0);
    });
  });

  describe('layout consistency', () => {
    it('uses same max-width as content', () => {
      render(<PricingContentSkeleton />);

      const skeleton = screen.getByTestId('pricing-skeleton');
      expect(skeleton).toHaveClass('max-w-md');
    });

    it('uses same padding as content', () => {
      render(<PricingContentSkeleton />);

      const skeleton = screen.getByTestId('pricing-skeleton');
      expect(skeleton).toHaveClass('px-4');
    });

    it('uses same gap spacing as content', () => {
      render(<PricingContentSkeleton />);

      const skeleton = screen.getByTestId('pricing-skeleton');
      expect(skeleton.querySelector('.space-y-4')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('renders semantic HTML structure', () => {
      render(<PricingContentSkeleton />);

      const skeleton = screen.getByTestId('pricing-skeleton');
      expect(skeleton.tagName).toBe('DIV');
    });

    it('does not have interactive elements', () => {
      render(<PricingContentSkeleton />);

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
  });
});
