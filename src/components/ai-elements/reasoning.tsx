'use client';

import { Brain, ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/ui/cn';

import { TextShimmer } from './shimmer';

/**
 * Reasoning - AI reasoning visualization component
 *
 * A collapsible component that displays AI reasoning content with real-time streaming support.
 *
 * Features:
 * - Stays collapsed during streaming with shimmer "Thinking..." animation
 * - User controls expand/collapse manually (no auto-expand/collapse)
 * - Shows "Thought for X seconds" when streaming completes
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
  isComplete: boolean;
  duration: number | undefined;
  reportContentGrowth: () => void;
  initialContentLength: number;
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
   * Whether the reasoning is currently being streamed (from parent message status)
   * Used as a fallback when content-based detection hasn't triggered yet.
   */
  isStreaming?: boolean;
  /**
   * Initial content length - pass when rendering historical messages
   * This prevents false "growth" detection on mount
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
  // ✅ CONTENT-BASED STREAMING: Track thinking state based on content growth
  const startTimeRef = useRef<number | undefined>(undefined);
  const hasEverGrownRef = useRef(false);
  const [calculatedDuration, setCalculatedDuration] = useState<number | undefined>(undefined);
  const [isThinking, setIsThinking] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Timeout for detecting when content stops growing
  const contentGrowthTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ✅ DURATION: Use stored duration from metadata, or calculated duration from this session
  const duration = storedDuration ?? calculatedDuration;

  // Callback for ReasoningContent to report content growth
  const reportContentGrowth = useCallback(() => {
    // First growth - start timing
    if (!hasEverGrownRef.current) {
      hasEverGrownRef.current = true;
      startTimeRef.current = Date.now();
    }

    // Set thinking state
    setIsThinking(true);
    setIsComplete(false);

    // Clear existing timeout
    if (contentGrowthTimeoutRef.current) {
      clearTimeout(contentGrowthTimeoutRef.current);
    }

    // Set timeout to detect when content stops growing (thinking is done)
    contentGrowthTimeoutRef.current = setTimeout(() => {
      // Content stopped growing - thinking is complete
      setIsThinking(false);
      setIsComplete(true);

      // Calculate duration
      if (startTimeRef.current) {
        const endTime = Date.now();
        const durationInSeconds = Math.round((endTime - startTimeRef.current) / 1000);
        setCalculatedDuration(durationInSeconds);
      }

      contentGrowthTimeoutRef.current = null;
    }, 800); // 800ms of no growth = thinking is done
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (contentGrowthTimeoutRef.current) {
        clearTimeout(contentGrowthTimeoutRef.current);
      }
    };
  }, []);

  // ✅ For historical messages (loaded with content, never saw growth)
  // Mark as complete after initial render if content exists but no growth detected
  const initialCheckDoneRef = useRef(false);
  useEffect(() => {
    if (!initialCheckDoneRef.current) {
      initialCheckDoneRef.current = true;
      // After a short delay, if we never saw growth, mark as complete (historical)
      const timer = setTimeout(() => {
        if (!hasEverGrownRef.current) {
          setIsComplete(true);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  // ✅ STREAMING STATE: Use content-based detection OR parent prop as fallback
  // This ensures shimmer shows even before first content arrives
  const isStreaming = isThinking || (isStreamingProp && !isComplete);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      // Allow user to expand/collapse at any time
      setIsOpen(newOpen);
    },
    [],
  );

  const contextValue = useMemo(
    () => ({
      open: isOpen,
      setOpen: handleOpenChange,
      isStreaming,
      isComplete,
      duration,
      reportContentGrowth,
      initialContentLength,
    }),
    [isOpen, handleOpenChange, isStreaming, isComplete, duration, reportContentGrowth, initialContentLength],
  );

  return (
    <ReasoningContext value={contextValue}>
      <Collapsible
        open={isOpen}
        onOpenChange={handleOpenChange}
        className={cn(
          'not-prose w-full mb-3',
          // Visual differentiation: subtle bg + border
          'rounded-lg bg-muted/30 border border-border/50 px-4 py-3',
          className,
        )}
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
  const { open, isStreaming, isComplete, duration } = useReasoning();

  // Live elapsed time counter during streaming
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const streamingStartRef = useRef<number | null>(null);
  const hasResetRef = useRef(false);

  // Track elapsed time during streaming with a live counter
  useEffect(() => {
    if (!isStreaming) {
      // Mark for reset on next streaming start
      streamingStartRef.current = null;
      hasResetRef.current = false;
      return undefined;
    }

    // Start tracking when streaming begins
    if (streamingStartRef.current === null) {
      streamingStartRef.current = Date.now();
    }

    // Update counter every second (also handles initial reset)
    const interval = setInterval(() => {
      if (streamingStartRef.current) {
        const elapsed = Math.floor((Date.now() - streamingStartRef.current) / 1000);
        // Reset to 0 on first tick if needed, then update normally
        if (!hasResetRef.current) {
          hasResetRef.current = true;
          setElapsedSeconds(0);
        } else {
          setElapsedSeconds(elapsed);
        }
      }
    }, 100); // Check more frequently for smoother updates

    return () => clearInterval(interval);
  }, [isStreaming]);

  // Dynamic message based on state
  const getMessage = (): string => {
    if (title) {
      return title;
    }
    if (isStreaming) {
      // Show live elapsed time counter: "Thinking... 5s"
      return elapsedSeconds > 0 ? `Thinking... ${elapsedSeconds}s` : 'Thinking...';
    }
    // Streamed and completed with measured duration
    if (duration !== undefined && duration > 0) {
      return `Thought for ${duration} second${duration === 1 ? '' : 's'}`;
    }
    // Very quick thinking (< 1 second)
    if (duration === 0) {
      return 'Thought for a moment';
    }
    // Loaded from history (never saw streaming, but has content)
    if (isComplete) {
      return 'Thought';
    }
    return 'Reasoning';
  };

  return (
    <div className="flex w-full">
      <CollapsibleTrigger
        className={cn(
          'flex flex-1 items-center justify-between gap-2 text-muted-foreground text-sm transition-colors',
          'hover:text-foreground cursor-pointer',
          className,
        )}
        {...props}
      >
        <div className="flex items-center gap-2">
          <Brain className={cn('size-4 shrink-0', isStreaming && 'animate-pulse')} />
          {isStreaming
            ? <TextShimmer className="font-medium text-sm">{getMessage()}</TextShimmer>
            : <span className="font-medium">{getMessage()}</span>}
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
  const { reportContentGrowth, initialContentLength } = useReasoning();

  // Track content length to detect growth
  const lastContentLengthRef = useRef<number>(initialContentLength);
  const isInitializedRef = useRef(false);

  // Track content growth by watching children changes
  useEffect(() => {
    const childText = typeof children === 'string' ? children : '';
    const currentLength = childText.length;

    // On first render, just sync the ref without triggering growth
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      // If initial content length wasn't provided but content exists, set it now
      if (lastContentLengthRef.current === 0 && currentLength > 0) {
        lastContentLengthRef.current = currentLength;
        return; // Don't report growth on initial mount with existing content
      }
    }

    // Report growth when content increases
    if (currentLength > lastContentLengthRef.current) {
      lastContentLengthRef.current = currentLength;
      reportContentGrowth();
    }
  }, [children, reportContentGrowth]);

  return (
    <CollapsibleContent
      className={cn(
        'mt-3 pt-3 w-full text-base text-muted-foreground border-t border-border/30',
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

// ============================================================================
// Utility: Get duration from reasoning for storage
// ============================================================================

/**
 * Hook to track reasoning duration for external storage
 * Call this in the parent component to get the duration after streaming completes
 *
 * @example
 * ```tsx
 * const reasoningRef = useRef<{ getDuration: () => number | undefined }>(null);
 *
 * // After streaming completes, store the duration
 * const duration = reasoningRef.current?.getDuration();
 * if (duration !== undefined) {
 *   updateMessageMetadata({ reasoningDuration: duration });
 * }
 * ```
 */
export function useReasoningDuration() {
  const context = use(ReasoningContext);
  return context?.duration;
}
