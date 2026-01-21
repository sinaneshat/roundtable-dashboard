import type { ComponentProps } from 'react';
import { useRef } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { useAutoResizeTextarea } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';

type ChatInputMinimalProps = {
  placeholder?: string;
  disabled?: boolean;
  minHeight?: number;
  maxHeight?: number;
  showToolbar?: boolean;
} & Omit<ComponentProps<'div'>, 'placeholder'>;

/**
 * Minimal chat input for SSR/skeleton states.
 *
 * - Same visual structure as ChatInput
 * - Functional textarea (users can type during hydration)
 * - Skeleton placeholders for toolbar (no hooks/interactivity)
 * - No store hooks, speech recognition, drag/drop
 *
 * Text typed here will be captured by ChatInput's useHydrationInputCapture
 * when the real component hydrates.
 */
export function ChatInputMinimal({
  placeholder = 'Message Roundtable...',
  disabled = false,
  minHeight = 72,
  maxHeight = 200,
  showToolbar = true,
  className,
  ...props
}: ChatInputMinimalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Still want auto-resize to work during skeleton state
  useAutoResizeTextarea(textareaRef, {
    value: '',
    minHeight,
    maxHeight,
  });

  return (
    <div className={cn('w-full', className)} {...props}>
      <div
        className={cn(
          'relative flex flex-col overflow-hidden',
          'rounded-2xl',
          'border border-border',
          'bg-card',
          'shadow-lg',
        )}
      >
        <div className="flex flex-col overflow-hidden h-full">
          <form
            onSubmit={(e) => {
              e.preventDefault();
            }}
            className="flex flex-col h-full"
          >
            <div className="px-3 sm:px-4 py-3 sm:py-4">
              <textarea
                ref={textareaRef}
                dir="auto"
                defaultValue=""
                disabled={disabled}
                placeholder={placeholder}
                className={cn(
                  'w-full bg-transparent border-0 text-sm sm:text-base leading-relaxed',
                  'focus:outline-none focus:ring-0',
                  'placeholder:text-muted-foreground/60',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'resize-none scrollbar-thin',
                )}
                aria-disabled={disabled}
                aria-label="Chat input"
              />
            </div>

            {showToolbar && (
              <div>
                <div className="px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3">
                  <div className="flex-1 flex items-center gap-1 sm:gap-2 min-w-0">
                    <Skeleton className="size-6 rounded" />
                    <Skeleton className="size-6 rounded" />
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <Skeleton className="size-11 rounded-full" />
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
