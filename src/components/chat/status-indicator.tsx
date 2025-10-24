'use client';

import { cn } from '@/lib/ui/cn';

/**
 * StatusIndicator - Pulsing dot animation for streaming/processing states
 *
 * A small, reusable component that displays a colored dot with optional pulsing animation.
 * Used throughout the chat interface to indicate real-time activity states.
 *
 * Usage:
 * - Message streaming indicators
 * - Participant activity status
 * - Processing/loading states
 * - Connection status indicators
 *
 * @example
 * // Streaming state
 * <StatusIndicator status="streaming" />
 *
 * // Error state
 * <StatusIndicator status="error" size="md" />
 *
 * // Idle state (no animation)
 * <StatusIndicator status="idle" />
 */

export type StatusIndicatorStatus = 'idle' | 'streaming' | 'error' | 'success';

export type StatusIndicatorProps = {
  /**
   * Current status - determines color and animation
   * - idle: muted gray, no animation
   * - streaming: primary blue, pulsing animation
   * - error: destructive red, pulsing animation
   * - success: green, no animation
   */
  'status': StatusIndicatorStatus;
  /**
   * Visual size of the indicator
   * - sm: 2px (8px with animation ring)
   * - md: 2.5px (10px with animation ring)
   * - lg: 3px (12px with animation ring)
   */
  'size'?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  'className'?: string;
  /** Accessible label for screen readers */
  'aria-label'?: string;
};

const sizeClasses = {
  sm: 'size-2',
  md: 'size-2.5',
  lg: 'size-3',
};

const statusClasses = {
  idle: 'bg-muted-foreground/40',
  streaming: 'bg-primary',
  error: 'bg-destructive',
  success: 'bg-chart-3', // Green success color from design system
};

export function StatusIndicator({
  status,
  size = 'sm',
  className,
  'aria-label': ariaLabel,
}: StatusIndicatorProps) {
  const isPulsing = status === 'streaming' || status === 'error';

  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      role="status"
      aria-label={ariaLabel || `Status: ${status}`}
    >
      {/* Pulsing animation ring (only for streaming/error) */}
      {isPulsing && (
        <span
          className={cn(
            'absolute inline-flex rounded-full opacity-75 animate-ping',
            sizeClasses[size],
            statusClasses[status],
          )}
          aria-hidden="true"
        />
      )}

      {/* Static dot */}
      <span
        className={cn(
          'relative inline-flex rounded-full',
          sizeClasses[size],
          statusClasses[status],
        )}
        aria-hidden="true"
      />
    </div>
  );
}
