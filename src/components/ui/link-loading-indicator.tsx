'use client';

import { useLinkStatus } from 'next/link';

import { cn } from '@/lib/ui/cn';

type LinkLoadingIndicatorProps = {
  className?: string;
  /** Variant for different visual styles */
  variant?: 'dot' | 'spinner' | 'shimmer';
  /** Size of the indicator */
  size?: 'xs' | 'sm' | 'md';
};

/**
 * Loading indicator for Next.js Link transitions using useLinkStatus hook.
 *
 * MUST be used as a child of a Next.js <Link> component.
 * Shows loading state when prefetch hasn't completed before navigation.
 *
 * Uses CSS animation-delay (100ms) to debounce - prevents flash on fast navigations.
 *
 * @example
 * ```tsx
 * <Link href="/chat/123">
 *   <span>Chat Title</span>
 *   <LinkLoadingIndicator variant="dot" size="xs" />
 * </Link>
 * ```
 */
export function LinkLoadingIndicator({
  className,
  variant = 'dot',
  size = 'xs',
}: LinkLoadingIndicatorProps) {
  const { pending } = useLinkStatus();

  const sizeClasses = {
    xs: 'size-1.5',
    sm: 'size-2',
    md: 'size-2.5',
  };

  if (variant === 'spinner') {
    return (
      <span
        aria-hidden
        className={cn(
          'shrink-0 rounded-full border border-current border-t-transparent',
          'opacity-0 transition-opacity',
          pending && 'link-pending-indicator animate-spin',
          sizeClasses[size],
          className,
        )}
      />
    );
  }

  if (variant === 'shimmer') {
    return (
      <span
        aria-hidden
        className={cn(
          'shrink-0 rounded-full bg-current',
          'opacity-0 transition-opacity',
          pending && 'link-pending-indicator animate-pulse',
          sizeClasses[size],
          className,
        )}
      />
    );
  }

  // Default: dot variant
  return (
    <span
      aria-hidden
      className={cn(
        'shrink-0 rounded-full bg-primary',
        'opacity-0 transition-opacity',
        pending && 'link-pending-indicator',
        sizeClasses[size],
        className,
      )}
    />
  );
}
