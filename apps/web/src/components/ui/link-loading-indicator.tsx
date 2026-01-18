import { cn } from '@/lib/ui/cn';

type LinkLoadingIndicatorProps = {
  className?: string;
  /** Variant for different visual styles */
  variant?: 'dot' | 'spinner' | 'shimmer';
  /** Size of the indicator */
  size?: 'xs' | 'sm' | 'md';
};

/**
 * Loading indicator for TanStack Router Link transitions.
 *
 * NOTE: This component is kept for UI consistency but currently never shows a loading state.
 * Consider using TanStack Router's useRouterState() for navigation state if needed.
 *
 * @example
 * ```tsx
 * <Link to="/chat/123">
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
  // Stub to always return false (no pending state)
  // Use TanStack Router's useRouterState() if navigation state is needed
  const pending = false;

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
