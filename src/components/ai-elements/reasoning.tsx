'use client';

import { Brain, ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/ui/cn';

/**
 * Reasoning - AI reasoning visualization component
 *
 * A collapsible component that displays AI reasoning content with real-time streaming support.
 *
 * Features:
 * - Starts collapsed by default (for completed messages)
 * - Auto-expands and locks during streaming (prevents accidental closure)
 * - Auto-collapses when streaming ends
 * - Manual toggle available when not streaming
 * - Real-time reasoning token streaming from AI SDK v5
 * - Smooth animations powered by Radix UI
 * - Visual streaming indicator with pulsing animation
 * - Composable architecture with separate trigger and content components
 *
 * @example
 * ```tsx
 * <Reasoning isStreaming={status === 'streaming'}>
 *   <ReasoningTrigger />
 *   <ReasoningContent>{part.text}</ReasoningContent>
 * </Reasoning>
 * ```
 */

// ============================================================================
// Context
// ============================================================================

type ReasoningContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  isStreaming: boolean;
  duration: number | undefined;
};

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoning() {
  const context = use(ReasoningContext);
  if (!context) {
    throw new Error('Reasoning components must be used within Reasoning');
  }
  return context;
}

// ============================================================================
// Root Component
// ============================================================================

type ReasoningProps = ComponentProps<typeof Collapsible> & {
  /**
   * Whether the reasoning is currently being streamed
   * Component starts collapsed by default (for completed messages).
   * Auto-expands and stays locked during stream.
   * Auto-collapses when streaming completes.
   * User can manually toggle when not streaming.
   */
  isStreaming?: boolean;
};

export function Reasoning({
  isStreaming = false,
  className,
  children,
  ...props
}: ReasoningProps) {
  const startTimeRef = useRef<number | undefined>(undefined);
  const wasStreamingRef = useRef(false);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  // ✅ Start collapsed for completed messages, open for streaming
  const [isOpen, setIsOpen] = useState(isStreaming);

  // Track streaming lifecycle for duration calculation and auto-expand/collapse
  useEffect(() => {
    if (isStreaming && !wasStreamingRef.current) {
      // Streaming started - auto-open
      startTimeRef.current = Date.now();
      wasStreamingRef.current = true;
      queueMicrotask(() => setIsOpen(true));
      return undefined;
    }

    if (!isStreaming && wasStreamingRef.current) {
      // Streaming stopped - calculate duration and auto-collapse
      wasStreamingRef.current = false;

      if (startTimeRef.current) {
        const endTime = Date.now();
        const durationInSeconds = Math.round((endTime - startTimeRef.current) / 1000);
        queueMicrotask(() => setDuration(durationInSeconds));
      }

      // ✅ Auto-collapse when streaming ends
      queueMicrotask(() => setIsOpen(false));
    }

    return undefined;
  }, [isStreaming]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      // Prevent collapsing while streaming (locked open during stream)
      if (isStreaming && !newOpen) {
        return;
      }
      // Allow manual toggle when not streaming
      setIsOpen(newOpen);
    },
    [isStreaming],
  );

  const contextValue = useMemo(
    () => ({ open: isOpen, setOpen: handleOpenChange, isStreaming, duration }),
    [isOpen, handleOpenChange, isStreaming, duration],
  );

  return (
    <ReasoningContext value={contextValue}>
      <Collapsible
        open={isOpen}
        onOpenChange={handleOpenChange}
        className={cn('not-prose mt-4 mb-4 w-full', className)}
        {...props}
      >
        {children}
      </Collapsible>
    </ReasoningContext>
  );
}

// ============================================================================
// Trigger
// ============================================================================

type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  /**
   * Optional title to display in the trigger
   * @default "Reasoning"
   */
  title?: string;
};

export function ReasoningTrigger({
  title,
  className,
  ...props
}: ReasoningTriggerProps) {
  const { open, isStreaming, duration } = useReasoning();

  // Dynamic message based on state
  const getMessage = () => {
    if (title) {
      return title;
    }
    if (isStreaming) {
      return 'Thinking...';
    }
    if (duration !== undefined) {
      return duration > 0 ? `Thought for ${duration} seconds` : 'Thought for a few seconds';
    }
    return 'Reasoning';
  };

  return (
    <div className="flex w-full">
      <CollapsibleTrigger
        disabled={isStreaming}
        className={cn(
          'flex flex-1 items-center justify-between gap-2 text-muted-foreground text-sm transition-colors',
          !isStreaming && 'hover:text-foreground cursor-pointer',
          isStreaming && 'cursor-default',
          className,
        )}
        {...props}
      >
        <div className="flex items-center gap-2">
          <Brain className="size-4 shrink-0" />
          <span className={cn(isStreaming && 'animate-pulse')}>{getMessage()}</span>
        </div>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 transition-transform duration-200',
            open && 'rotate-180',
            isStreaming && 'opacity-50',
          )}
        />
      </CollapsibleTrigger>
    </div>
  );
}

// ============================================================================
// Content
// ============================================================================

type ReasoningContentProps = ComponentProps<typeof CollapsibleContent>;

export function ReasoningContent({
  className,
  children,
  ...props
}: ReasoningContentProps) {
  return (
    <CollapsibleContent
      className={cn(
        'mt-4 w-full text-sm text-muted-foreground',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2',
        'data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2',
        className,
      )}
      {...props}
    >
      <div className="w-full whitespace-pre-wrap leading-relaxed">
        {children}
      </div>
    </CollapsibleContent>
  );
}
