import type { ComponentProps } from 'react';

import { ChatInputMinimal } from '@/components/chat/chat-input-minimal';
import { cn } from '@/lib/ui/cn';

type StickyInputSkeletonProps = {
  /** Auto mode hides model/mode/web search controls - only shows attachment button */
  autoMode?: boolean;
} & ComponentProps<'div'>;

/**
 * StickyInputSkeleton - Sticky chat input loading skeleton
 *
 * Uses ChatInputMinimal for functional textarea during hydration -
 * text typed here will be captured by ChatInput's useHydrationInputCapture.
 */
export function StickyInputSkeleton({ autoMode = true, className, ...props }: StickyInputSkeletonProps) {
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
        <ChatInputMinimal showToolbar autoMode={autoMode} />
      </div>
    </div>
  );
}
