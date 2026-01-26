import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type MessageCardSkeletonProps = {
  variant?: 'user' | 'assistant';
} & ComponentProps<'div'>;

/**
 * MessageCardSkeleton - Reusable skeleton for chat message cards
 *
 * Matches the structure of actual chat messages with participant header and content.
 * Used across chat views, demos, and public chat displays.
 *
 * @param props - Component props
 * @param props.variant - 'user' (right-aligned) or 'assistant' (left-aligned with avatar/name)
 * @param props.className - Optional CSS class names
 */
export function MessageCardSkeleton({
  className,
  variant = 'assistant',
  ...props
}: MessageCardSkeletonProps) {
  if (variant === 'user') {
    return (
      <div className={cn('mb-4 flex justify-end', className)} {...props}>
        <div className="max-w-[80%]">
          <div className="flex items-center gap-3 mb-5 flex-row-reverse">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('mb-4 flex justify-start', className)} {...props}>
      <div className="max-w-[85%]">
        <div className="flex items-center gap-3 mb-5">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}
