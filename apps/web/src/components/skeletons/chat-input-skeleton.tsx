import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type ChatInputSkeletonProps = {
  showToolbar?: boolean;
  showHeader?: boolean;
} & ComponentProps<'div'>;

export function ChatInputSkeleton({
  showToolbar = true,
  showHeader = false,
  className,
  ...props
}: ChatInputSkeletonProps) {
  return (
    <div className={cn('w-full', className)} {...props}>
      {/* ✅ Match ChatInputContainer: bg-card, border-border for dark mode */}
      <div className="rounded-2xl bg-card border border-border shadow-lg overflow-hidden">
        {showHeader && (
          <div className="flex items-center justify-between px-2 sm:px-3 py-1.5 sm:py-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
        )}
        <div className="p-4">
          <Skeleton className="h-12 w-full rounded-xl" />
          {showToolbar && (
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                <Skeleton className="size-6 rounded" />
                <Skeleton className="size-6 rounded" />
              </div>
              <Skeleton className="size-8 rounded-full" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
