import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type ParticipantHeaderSkeletonProps = {
  showRole?: boolean;
  showStatus?: boolean;
} & ComponentProps<'div'>;

/**
 * ParticipantHeaderSkeleton - Reusable skeleton for participant headers
 *
 * Matches ParticipantHeader component structure with avatar, name, and optional role badge.
 * Used in chat messages, participant lists, and other participant-related UI.
 *
 * @param props - Component props
 * @param props.showRole - Whether to show the role badge skeleton
 * @param props.showStatus - Whether to show the streaming/error status indicator skeleton
 * @param props.className - Optional CSS class names
 */
export function ParticipantHeaderSkeleton({
  showRole = true,
  showStatus = false,
  className,
  ...props
}: ParticipantHeaderSkeletonProps) {
  return (
    <div className={cn('flex items-center gap-3 mb-6', className)} {...props}>
      <Skeleton className="size-8 rounded-full" />
      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
        <Skeleton className="h-5 w-32" />
        {showRole && <Skeleton className="h-5 w-20 rounded-full" />}
        {showStatus && <Skeleton className="ml-1 size-1.5 rounded-full" />}
      </div>
    </div>
  );
}
