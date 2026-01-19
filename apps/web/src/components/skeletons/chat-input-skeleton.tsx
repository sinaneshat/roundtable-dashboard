import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type ChatInputSkeletonProps = {
  showToolbar?: boolean;
  isSticky?: boolean;
} & ComponentProps<'div'>;

/**
 * ChatInputSkeleton - Reusable skeleton for chat input area
 *
 * Matches ChatInput component structure with textarea and optional toolbar.
 * Can be rendered as sticky footer or inline component.
 *
 * @param props - Component props
 * @param props.showToolbar - Whether to show the toolbar skeleton (attachment/submit buttons)
 * @param props.isSticky - Whether to render with sticky positioning (bottom-fixed)
 * @param props.className - Optional CSS class names
 */
export function ChatInputSkeleton({
  showToolbar = true,
  isSticky = false,
  className,
  ...props
}: ChatInputSkeletonProps) {
  const content = (
    <div className="rounded-2xl bg-card border border-border/50 shadow-lg p-4">
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
  );

  if (isSticky) {
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
          {content}
        </div>
        <div className="h-4 bg-background" />
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)} {...props}>
      {content}
    </div>
  );
}
