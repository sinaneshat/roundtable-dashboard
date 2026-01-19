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
        className,
      )}
      {...props}
    >
      {/* ✅ Match ChatView: gradient as overlay, same from-85% stop */}
      <div className="absolute inset-0 -bottom-4 bg-gradient-to-t from-background from-85% to-transparent pointer-events-none" />
      <div className="w-full max-w-4xl mx-auto px-5 md:px-6 pt-4 pb-4 relative">
        <ChatInputSkeleton showHeader showToolbar />
      </div>
    </div>
  );
}
