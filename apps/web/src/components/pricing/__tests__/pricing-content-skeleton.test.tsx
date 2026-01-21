/**
 * PricingContentSkeleton Component Tests
 *
 * Tests for the pricing content loading skeleton covering:
 * - Skeleton structure rendering
 * - Animation presence
 * - Consistent layout with actual content
 */

import { describe, expect, it } from 'vitest';

import { render } from '@/lib/testing';

import { PricingContentSkeleton } from '../pricing-content-skeleton';

describe('pricingContentSkeleton', () => {
  describe('skeleton rendering', () => {
    it('renders skeleton structure', () => {
      const { container } = render(<PricingContentSkeleton />);

      expect(container.querySelector('.mx-auto')).toBeInTheDocument();
    });

    it('renders with proper max-width layout', () => {
      const { container } = render(<PricingContentSkeleton />);

      const maxWidthContainer = container.querySelector('.max-w-md');
      expect(maxWidthContainer).toBeInTheDocument();
    });

    it('renders skeleton card wrapper', () => {
      const { container } = render(<PricingContentSkeleton />);

      const cardWrapper = container.querySelector('.rounded-2xl');
      expect(cardWrapper).toBeInTheDocument();
    });

    it('renders skeleton card content', () => {
      const { container } = render(<PricingContentSkeleton />);

      const cardContent = container.querySelector('.rounded-xl');
      expect(cardContent).toBeInTheDocument();
    });
  });

  describe('skeleton elements', () => {
    it('renders title skeleton', () => {
      const { container } = render(<PricingContentSkeleton />);

      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders feature list skeletons', () => {
      const { container } = render(<PricingContentSkeleton />);

      const featureItems = container.querySelectorAll('.flex.items-center.gap-3');
      expect(featureItems).toHaveLength(4);
    });

    it('renders price skeleton', () => {
      const { container } = render(<PricingContentSkeleton />);

      const priceArea = container.querySelector('.flex.items-baseline.gap-1');
      expect(priceArea).toBeInTheDocument();
    });

    it('renders button skeleton', () => {
      const { container } = render(<PricingContentSkeleton />);

      const buttonSkeleton = container.querySelector('.h-11.w-full');
      expect(buttonSkeleton).toBeInTheDocument();
    });
  });

  describe('animation', () => {
    it('has pulse animation class', () => {
      const { container } = render(<PricingContentSkeleton />);

      const animatedElements = container.querySelectorAll('[class*="animate-pulse"]');
      expect(animatedElements.length).toBeGreaterThan(0);
    });
  });

  describe('layout consistency', () => {
    it('uses same max-width as content', () => {
      const { container } = render(<PricingContentSkeleton />);

      const maxWidthContainer = container.querySelector('.max-w-md');
      expect(maxWidthContainer).toBeInTheDocument();
    });

    it('uses same padding as content', () => {
      const { container } = render(<PricingContentSkeleton />);

      const paddedContainer = container.querySelector('.px-4');
      expect(paddedContainer).toBeInTheDocument();
    });

    it('uses same gap spacing as content', () => {
      const { container } = render(<PricingContentSkeleton />);

      const spacedContainer = container.querySelector('.space-y-4');
      expect(spacedContainer).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('renders semantic HTML structure', () => {
      const { container } = render(<PricingContentSkeleton />);

      expect(container.querySelector('div')).toBeInTheDocument();
    });

    it('does not have interactive elements', () => {
      const { container } = render(<PricingContentSkeleton />);

      expect(container.querySelector('button')).not.toBeInTheDocument();
      expect(container.querySelector('a')).not.toBeInTheDocument();
    });
  });
});
