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
   * Whether the reasoning is currently being streamed
   * Component stays collapsed during streaming with shimmer animation.
   * User can manually toggle to see reasoning content at any time.
   * Shows "Thought for X seconds" when streaming completes.
   */
  isStreaming?: boolean;
  /**
   * Initial content length - pass when rendering historical messages
   * This prevents false "growth" detection on mount
   */
  initialContentLength?: number;
};

export function Reasoning({
  isStreaming: _isStreamingProp = false,
  initialContentLength = 0,
  className,
  children,
  ...props
}: ReasoningProps) {
  // ✅ CONTENT-BASED STREAMING: Track thinking state based on content growth, not message status
  // This works for ALL models (DeepSeek, GPT, Grok) regardless of how they send reasoning
  const startTimeRef = useRef<number | undefined>(undefined);
  const hasEverGrownRef = useRef(false);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [isThinking, setIsThinking] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Timeout for detecting when content stops growing
  const contentGrowthTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Callback for ReasoningContent to report content growth
  const reportContentGrowth = useCallback(() => {
    // First growth - start timing
    if (!hasEverGrownRef.current) {
      hasEverGrownRef.current = true;
      startTimeRef.current = Date.now();
    }

    // Set thinking state (but do NOT auto-expand - keep collapsed during streaming)
    // This ensures the shimmer animation plays while content streams
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
        setDuration(durationInSeconds);
      }

      // Do NOT auto-collapse - user controls open/close state manually
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

  // ✅ STREAMING STATE: Based purely on content growth, not parent's message status
  const isStreaming = isThinking;

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
    () => ({ open: isOpen, setOpen: handleOpenChange, isStreaming, isComplete, duration, reportContentGrowth, initialContentLength }),
    [isOpen, handleOpenChange, isStreaming, isComplete, duration, reportContentGrowth, initialContentLength],
  );

  return (
    <ReasoningContext value={contextValue}>
      <Collapsible
        open={isOpen}
        onOpenChange={handleOpenChange}
        className={cn('not-prose w-full mb-3', className)}
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

/**
 * Shimmer text component for thinking state
 * Creates a smooth, character-by-character shimmer animation
 * Uses CSS-based animations for better caching reliability in deployed environments
 */
/* eslint-disable react/no-array-index-key -- Character animation requires position-based keys; chars aren't unique */
function ShimmerText({ text }: { text: string }) {
  return (
    <span className="font-medium">
      {text.split('').map((char, i) => (
        <span
          key={`char-${i}`}
          className={`animate-shimmer-char shimmer-delay-${i % 16}`}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  );
}
/* eslint-enable react/no-array-index-key */

export function ReasoningTrigger({
  title,
  className,
  ...props
}: ReasoningTriggerProps) {
  const { open, isStreaming, isComplete, duration } = useReasoning();

  // Dynamic message based on state
  // ✅ Shows: "Thinking..." (streaming) → "Thought for X seconds" (streamed) → "Thought" (loaded from history)
  const getMessage = () => {
    if (title) {
      return title;
    }
    if (isStreaming) {
      return 'Thinking...';
    }
    // Streamed and completed with measured duration
    if (duration !== undefined) {
      return duration > 0 ? `Thought for ${duration} seconds` : 'Thought for a moment';
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
          <Brain className={cn('size-4 shrink-0', isStreaming && 'animate-pulse')} />
          {/* ✅ SHIMMER: Use shimmer animation during thinking state */}
          {isStreaming
            ? <ShimmerText text={getMessage()} />
            : <span>{getMessage()}</span>}
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

  // ✅ FIX: Initialize with actual content length to prevent false growth detection on refresh
  // On first mount with historical data, initialContentLength should match children length
  // This prevents showing "Thinking..." shimmer for completed reasoning blocks
  const lastContentLengthRef = useRef<number>(initialContentLength);
  const isInitializedRef = useRef(false);

  // Track content growth by watching children changes
  useEffect(() => {
    const childText = typeof children === 'string' ? children : '';
    const currentLength = childText.length;

    // ✅ FIX: On first render, just sync the ref without triggering growth
    // This handles page refresh where content already exists
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      // If initial content length wasn't provided, set it now
      if (lastContentLengthRef.current === 0 && currentLength > 0) {
        lastContentLengthRef.current = currentLength;
        return; // Don't report growth on initial mount
      }
    }

    if (currentLength > lastContentLengthRef.current) {
      // Content grew - report it to parent
      lastContentLengthRef.current = currentLength;
      reportContentGrowth();
    }
  }, [children, reportContentGrowth]);

  return (
    <CollapsibleContent
      className={cn(
        'mt-4 w-full text-sm text-muted-foreground',
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
