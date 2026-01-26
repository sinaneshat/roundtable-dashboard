import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type ChatInputSkeletonProps = {
  showToolbar?: boolean;
  showHeader?: boolean;
  /** Auto mode hides model/mode/web search controls - only shows attachment button */
  autoMode?: boolean;
} & ComponentProps<'div'>;

export function ChatInputSkeleton({
  autoMode = true,
  className,
  showHeader = false,
  showToolbar = true,
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
              {/* Desktop toolbar skeleton */}
              <div className="hidden md:flex items-center gap-2">
                {!autoMode && (
                  <>
                    <Skeleton className="h-9 w-20 rounded-2xl" />
                    <Skeleton className="h-9 w-16 rounded-2xl" />
                  </>
                )}
                <Skeleton className="size-11 rounded-xl" />
                {!autoMode && <Skeleton className="size-11 rounded-xl" />}
              </div>
              {/* Mobile toolbar skeleton */}
              <div className="flex md:hidden items-center gap-1.5">
                <Skeleton className="size-11 rounded-xl" />
                {!autoMode && <Skeleton className="h-9 w-14 rounded-full" />}
              </div>
              <Skeleton className="size-11 rounded-full" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
