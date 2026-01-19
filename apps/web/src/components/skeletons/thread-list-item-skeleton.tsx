import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type ThreadListItemSkeletonProps = {
  count?: number;
  animated?: boolean;
  widthVariant?: number;
} & ComponentProps<'div'>;

const SIDEBAR_SKELETON_WIDTHS = [
  '70%',
  '55%',
  '85%',
  '45%',
  '65%',
  '78%',
  '52%',
  '62%',
  '48%',
  '73%',
  '58%',
  '80%',
  '42%',
  '67%',
  '54%',
];

/**
 * ThreadListItemSkeleton - Reusable skeleton for sidebar thread list items
 *
 * Matches the structure of thread items in the chat sidebar.
 * Supports multiple items with varying widths and fade-out effect for bottom items.
 *
 * @param props - Component props
 * @param props.count - Number of skeleton items to render
 * @param props.animated - Whether to apply pulse animation
 * @param props.widthVariant - Index to determine width from preset array (cycles if not provided)
 * @param props.className - Optional CSS class names
 */
export function ThreadListItemSkeleton({
  count = 1,
  animated = false,
  widthVariant,
  className,
  ...props
}: ThreadListItemSkeletonProps) {
  if (count === 1) {
    const width = widthVariant !== undefined
      ? SIDEBAR_SKELETON_WIDTHS[widthVariant % SIDEBAR_SKELETON_WIDTHS.length]
      : '70%';

    return (
      <Skeleton
        className={cn('h-5 rounded-full', animated && 'animate-pulse', className)}
        style={{ width }}
        {...props}
      />
    );
  }

  return (
    <div
      className={cn('flex flex-col gap-3 pointer-events-none select-none', className)}
      aria-hidden="true"
      {...props}
    >
      {Array.from({ length: count }, (_, i) => {
        const widthIndex = i % SIDEBAR_SKELETON_WIDTHS.length;
        const opacity = i < 4 ? 1 : i < 5 ? 0.7 : i < 6 ? 0.5 : 0.3;

        return (
          <Skeleton
            key={`thread-skeleton-${i}`}
            className={cn('h-5 rounded-full', animated && 'animate-pulse')}
            style={{
              width: SIDEBAR_SKELETON_WIDTHS[widthIndex],
              opacity,
            }}
          />
        );
      })}
    </div>
  );
}
