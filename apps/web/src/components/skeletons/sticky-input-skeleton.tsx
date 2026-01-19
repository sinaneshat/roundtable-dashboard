import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

/**
 * StickyInputSkeleton - Sticky chat input loading skeleton
 *
 * Matches ChatInputContainer structure with header, input area, and toolbar.
 * Uses subtle borders (border-border/50) to match actual component styling.
 * Always renders with sticky positioning at bottom of container.
 */
export function StickyInputSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-30 mt-auto',
        'bg-gradient-to-t from-background via-background to-transparent pt-6',
        className,
      )}
      {...props}
    >
      <div className="w-full max-w-4xl mx-auto px-5 md:px-6">
        {/* Match ChatInputContainer: subtle border */}
        <div className="rounded-2xl bg-card border border-border/50 shadow-lg overflow-hidden">
          {/* Header area */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
          {/* Input area */}
          <div className="p-4">
            <Skeleton className="h-12 w-full rounded-xl" />
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                <Skeleton className="size-6 rounded" />
                <Skeleton className="size-6 rounded" />
              </div>
              <Skeleton className="size-8 rounded-full" />
            </div>
          </div>
        </div>
      </div>
      <div className="h-4 bg-background" />
    </div>
  );
}
