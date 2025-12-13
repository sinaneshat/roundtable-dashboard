'use client';

import { ChevronRight } from 'lucide-react';
import type { ComponentProps } from 'react';
import { createContext, use, useCallback, useMemo, useState } from 'react';

import type { ReasoningState } from '@/api/core/enums';
import { ReasoningStates } from '@/api/core/enums';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useElapsedTime } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';

import { TextShimmer } from './shimmer';

/**
 * Reasoning - AI reasoning visualization component
 *
 * Simplified state machine with clear transitions:
 * - IDLE: Never streamed, shows "Reasoning" fallback
 * - THINKING: Currently streaming, shows "Thinking..." with live timer
 * - COMPLETE: Finished streaming, shows "Thought for X seconds"
 */

// ============================================================================
// Context
// ============================================================================

type ReasoningContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  state: ReasoningState;
  elapsedSeconds: number;
  finalDuration: number | undefined;
};

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoningContext() {
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
   * Whether the reasoning is currently being streamed (from parent message status)
   * This is the SINGLE SOURCE OF TRUTH for streaming state
   */
  isStreaming?: boolean;
  /**
   * Initial content length - pass when rendering historical messages
   * Used to determine if this is a historical message
   */
  initialContentLength?: number;
  /**
   * Stored duration from metadata - for historical messages that were previously streamed
   * Pass this to show "Thought for X seconds" on page refresh
   */
  storedDuration?: number;
};

export function Reasoning({
  isStreaming: isStreamingProp = false,
  initialContentLength = 0,
  storedDuration,
  className,
  children,
  ...props
}: ReasoningProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Use the elapsed time hook for clean timer management
  const { elapsedSeconds, finalDuration: calculatedDuration } = useElapsedTime(isStreamingProp);

  // ✅ STATE MACHINE: Derive state from props using enum values
  const state: ReasoningState = useMemo(() => {
    // Historical message with stored duration → complete
    if (storedDuration !== undefined) {
      return ReasoningStates.COMPLETE;
    }
    // Currently streaming → thinking
    if (isStreamingProp) {
      return ReasoningStates.THINKING;
    }
    // Has calculated duration (finished streaming this session) → complete
    if (calculatedDuration !== undefined) {
      return ReasoningStates.COMPLETE;
    }
    // Historical message (has content but never saw streaming) → complete
    if (initialContentLength > 0) {
      return ReasoningStates.COMPLETE;
    }
    // Never streamed, no content → idle
    return ReasoningStates.IDLE;
  }, [isStreamingProp, storedDuration, calculatedDuration, initialContentLength]);

  // Final duration: stored > calculated
  const finalDuration = storedDuration ?? calculatedDuration;

  const handleOpenChange = useCallback((newOpen: boolean) => {
    setIsOpen(newOpen);
  }, []);

  const contextValue = useMemo(
    () => ({
      open: isOpen,
      setOpen: handleOpenChange,
      state,
      elapsedSeconds,
      finalDuration,
    }),
    [isOpen, handleOpenChange, state, elapsedSeconds, finalDuration],
  );

  return (
    <ReasoningContext value={contextValue}>
      <Collapsible
        open={isOpen}
        onOpenChange={handleOpenChange}
        className={cn('not-prose w-full mb-4', className)}
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
   * Optional title to override the default message
   */
  title?: string;
};

export function ReasoningTrigger({
  title,
  className,
  ...props
}: ReasoningTriggerProps) {
  const { open, state, elapsedSeconds, finalDuration } = useReasoningContext();

  // ✅ CLEAR STATE-BASED MESSAGING using enum values
  const getMessage = (): string => {
    if (title) {
      return title;
    }

    switch (state) {
      case ReasoningStates.THINKING:
        // Live counter: "Thinking..." → "Thinking... 1s" → "Thinking... 2s"
        return elapsedSeconds > 0 ? `Thinking... ${elapsedSeconds}s` : 'Thinking...';

      case ReasoningStates.COMPLETE:
        // Completed with duration
        if (finalDuration !== undefined && finalDuration > 0) {
          return `Thought for ${finalDuration} second${finalDuration === 1 ? '' : 's'}`;
        }
        // Quick thinking (< 1 second) or no duration tracked
        return 'Thought for a moment';

      case ReasoningStates.IDLE:
      default:
        return 'Reasoning';
    }
  };

  const isThinking = state === ReasoningStates.THINKING;

  return (
    <CollapsibleTrigger
      className={cn(
        'flex items-center gap-1.5 text-muted-foreground text-sm cursor-pointer hover:text-foreground transition-colors',
        className,
      )}
      {...props}
    >
      <ChevronRight
        className={cn(
          'size-3.5 shrink-0 transition-transform duration-200',
          open && 'rotate-90',
        )}
      />
      {isThinking
        ? <TextShimmer className="font-medium">{getMessage()}</TextShimmer>
        : <span className="font-medium">{getMessage()}</span>}
    </CollapsibleTrigger>
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
      className={cn('mt-2 text-sm text-muted-foreground', className)}
      {...props}
    >
      <div className="whitespace-pre-wrap leading-relaxed pl-5">
        {children}
      </div>
    </CollapsibleContent>
  );
}
