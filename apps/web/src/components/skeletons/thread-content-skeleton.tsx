import type { ComponentProps } from 'react';

import { cn } from '@/lib/ui/cn';

import { MessageCardSkeleton } from './message-card-skeleton';
import { StickyInputSkeleton } from './sticky-input-skeleton';

/**
 * ThreadContentSkeleton - Chat thread view loading skeleton
 *
 * Matches thread view layout with messages area and sticky input.
 * Uses shared MessageCardSkeleton for message loading states.
 */
export function ThreadContentSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('flex-1 flex flex-col', className)} {...props}>
      {/* Messages area */}
      <div className="flex-1 overflow-hidden">
        <div className="w-full max-w-4xl mx-auto px-5 md:px-6 py-6 space-y-6">
          {/* User message */}
          <MessageCardSkeleton variant="user" />

          {/* Assistant messages */}
          {[1, 2, 3].map(i => (
            <MessageCardSkeleton key={i} variant="assistant" />
          ))}
        </div>
      </div>

      {/* Sticky input skeleton */}
      <StickyInputSkeleton />
    </div>
  );
}
