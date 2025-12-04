'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { memo, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/ui/cn';

// ============================================================================
// STREAMING TEXT - Shimmer animation for text being generated
// ============================================================================

type StreamingTextProps = {
  /** The text content to display */
  children: string;
  /** Whether the text is actively streaming */
  isStreaming?: boolean;
  /** Number of characters at the end to animate (default: 20) */
  shimmerLength?: number;
  /** Custom class name */
  className?: string;
  /** Animation speed - lower is faster (default: 0.05) */
  animationDelay?: number;
};

/**
 * StreamingText - Animated text display for streaming content
 *
 * Applies a shimmer/glow animation to the trailing characters of text
 * that is being actively streamed/generated. Non-streaming text renders normally.
 *
 * @example
 * ```tsx
 * <StreamingText isStreaming={status === 'streaming'}>
 *   {message.text}
 * </StreamingText>
 * ```
 */
export const StreamingText = memo(function StreamingText({
  children,
  isStreaming = false,
  shimmerLength = 20,
  className,
  animationDelay = 0.04,
}: StreamingTextProps) {
  // Track previous length to detect new characters
  const prevLengthRef = useRef(children.length);
  const [newCharsCount, setNewCharsCount] = useState(0);

  useEffect(() => {
    if (!isStreaming) {
      setNewCharsCount(0);
      prevLengthRef.current = children.length;
      return undefined;
    }

    const newChars = children.length - prevLengthRef.current;
    if (newChars > 0) {
      setNewCharsCount(Math.min(newChars, shimmerLength));
      // Reset after animation completes
      const timer = setTimeout(() => {
        setNewCharsCount(0);
      }, shimmerLength * animationDelay * 1000 + 500);
      prevLengthRef.current = children.length;
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [children, isStreaming, shimmerLength, animationDelay]);

  // If not streaming or no new chars, render plain text
  if (!isStreaming || newCharsCount === 0) {
    return <span className={className}>{children}</span>;
  }

  // Split into stable and animated parts
  const stableText = children.slice(0, -newCharsCount);
  const animatedText = children.slice(-newCharsCount);

  return (
    <span className={className}>
      {stableText}
      {animatedText.split('').map((char, i) => (
        <motion.span
          key={`${children.length}-${i}`}
          className="inline"
          initial={{ opacity: 0.3 }}
          animate={{
            opacity: [0.3, 1, 1],
          }}
          transition={{
            duration: 0.3,
            delay: i * animationDelay,
            ease: 'easeOut',
          }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
});

// ============================================================================
// RE-EXPORT SHIMMER - Single source of truth from ai-elements
// ============================================================================

// Re-export Shimmer from ai-elements as the single source of truth for shimmer effects
export { Shimmer } from '@/components/ai-elements/shimmer';
export type { TextShimmerProps as ShimmerProps } from '@/components/ai-elements/shimmer';

// ============================================================================
// STREAMING BLOCK - Wrapper for streaming content blocks
// ============================================================================

type StreamingBlockProps = {
  /** Whether the content is actively streaming */
  isStreaming?: boolean;
  /** Children to render */
  children: ReactNode;
  /** Custom class name */
  className?: string;
};

/**
 * StreamingBlock - Animated container for streaming content
 *
 * Adds a subtle glow effect to the container while streaming,
 * and smooth fade-in animation for new content.
 *
 * @example
 * ```tsx
 * <StreamingBlock isStreaming={isAnalyzing}>
 *   <AnalysisContent data={analysisData} />
 * </StreamingBlock>
 * ```
 */
export const StreamingBlock = memo(function StreamingBlock({
  isStreaming = false,
  children,
  className,
}: StreamingBlockProps) {
  return (
    <motion.div
      className={cn(
        'relative',
        isStreaming && 'streaming-glow',
        className,
      )}
      initial={false}
      animate={{
        opacity: 1,
      }}
    >
      {children}
      {/* Streaming indicator line */}
      {isStreaming && (
        <motion.div
          className="absolute bottom-0 left-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
          initial={{ width: '0%', opacity: 0 }}
          animate={{
            width: ['0%', '100%', '0%'],
            opacity: [0, 1, 0],
            x: ['0%', '0%', '100%'],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}
    </motion.div>
  );
});

// ============================================================================
// STREAMING PARAGRAPH - For markdown paragraphs during streaming
// ============================================================================

type StreamingParagraphProps = {
  /** The text content */
  children: string;
  /** Whether actively streaming */
  isStreaming?: boolean;
  /** Custom class name */
  className?: string;
};

/**
 * StreamingParagraph - Paragraph with streaming animation
 *
 * Renders a paragraph with subtle animation on trailing text
 * when content is being streamed.
 */
export const StreamingParagraph = memo(function StreamingParagraph({
  children,
  isStreaming = false,
  className,
}: StreamingParagraphProps) {
  const lastTextRef = useRef(children);
  const [isGrowing, setIsGrowing] = useState(false);

  useEffect(() => {
    if (children.length > lastTextRef.current.length) {
      setIsGrowing(true);
      const timer = setTimeout(() => setIsGrowing(false), 100);
      lastTextRef.current = children;
      return () => clearTimeout(timer);
    }
    lastTextRef.current = children;
    return undefined;
  }, [children]);

  return (
    <p
      className={cn(
        'transition-opacity duration-150',
        isStreaming && isGrowing && 'opacity-95',
        className,
      )}
    >
      {children}
      {isStreaming && (
        <motion.span
          className="inline-block ml-0.5 w-1.5 h-4 bg-primary/60 rounded-sm align-middle"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
      )}
    </p>
  );
});

// ============================================================================
// USE STREAMING DETECTION - Hook to detect active streaming
// ============================================================================

/**
 * Hook to detect if content is actively streaming based on text growth
 *
 * @param text - The text content to monitor
 * @param debounceMs - Debounce time to consider streaming stopped (default: 500)
 * @returns Whether text is actively growing (streaming)
 */
export function useStreamingDetection(text: string, debounceMs = 500): boolean {
  const [isStreaming, setIsStreaming] = useState(false);
  const lastLengthRef = useRef(text.length);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const currentLength = text.length;
    const grew = currentLength > lastLengthRef.current;
    lastLengthRef.current = currentLength;

    if (grew) {
      setIsStreaming(true);

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout to mark streaming as stopped
      timeoutRef.current = setTimeout(() => {
        setIsStreaming(false);
        timeoutRef.current = null;
      }, debounceMs);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [text, debounceMs]);

  return isStreaming;
}

// ============================================================================
// STREAMING CURSOR - Animated typing cursor
// ============================================================================

type StreamingCursorProps = {
  /** Whether to show the cursor */
  show?: boolean;
  /** Custom class name */
  className?: string;
};

/**
 * StreamingCursor - Animated blinking cursor for streaming text
 */
export const StreamingCursor = memo(function StreamingCursor({
  show = true,
  className,
}: StreamingCursorProps) {
  if (!show) return null;

  return (
    <motion.span
      className={cn(
        'inline-block w-0.5 h-[1em] bg-primary/70 rounded-sm align-middle ml-0.5',
        className,
      )}
      animate={{ opacity: [1, 0.2, 1] }}
      transition={{
        duration: 0.8,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
});

// ============================================================================
// STREAMING MARKDOWN WRAPPER - For use with Streamdown
// ============================================================================

type StreamingMarkdownProps = {
  /** Children from markdown renderer */
  children: ReactNode;
  /** Whether content is streaming */
  isStreaming?: boolean;
  /** Custom class name */
  className?: string;
};

/**
 * StreamingMarkdown - Wrapper to add streaming effects to markdown content
 *
 * Wrap around Streamdown or ReactMarkdown output to add streaming visual effects.
 */
export const StreamingMarkdown = memo(function StreamingMarkdown({
  children,
  isStreaming = false,
  className,
}: StreamingMarkdownProps) {
  return (
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none',
        'transition-all duration-200',
        className,
      )}
    >
      {children}
      {isStreaming && <StreamingCursor show />}
    </div>
  );
});
