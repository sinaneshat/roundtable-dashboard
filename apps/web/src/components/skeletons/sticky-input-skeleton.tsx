import type { ComponentProps } from 'react';

import { cn } from '@/lib/ui/cn';

import { ChatInputSkeleton } from './chat-input-skeleton';

/**
 * StickyInputSkeleton - Sticky chat input loading skeleton
 *
 * Wraps ChatInputSkeleton with sticky positioning and gradient background.
 * Uses shared ChatInputSkeleton for the actual input card structure.
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
        <ChatInputSkeleton showHeader showToolbar />
      </div>
      <div className="h-4 bg-background" />
    </div>
  );
}
