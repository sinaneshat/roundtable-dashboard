import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

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
export const StreamingText = memo(({
  children,
  isStreaming = false,
  shimmerLength = 20,
  className,
  animationDelay = 0.04,
}: StreamingTextProps) => {
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
      prevLengthRef.current = children.length;
    }
    return undefined;
  }, [children, isStreaming, shimmerLength]);

  // ✅ FIX: Use callback for animation complete instead of setTimeout
  // This is called when the LAST character finishes its animation
  const handleLastCharAnimationComplete = useCallback(() => {
    // Use rAF to ensure the completed animation frame is painted before state update
    requestAnimationFrame(() => {
      setNewCharsCount(0);
    });
  }, []);

  // If not streaming or no new chars, render plain text
  if (!isStreaming || newCharsCount === 0) {
    return <span className={className}>{children}</span>;
  }

  // Split into stable and animated parts
  const stableText = children.slice(0, -newCharsCount);
  const animatedText = children.slice(-newCharsCount);
  const lastCharIndex = animatedText.length - 1;

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
          // ✅ FIX: Use onAnimationComplete on the last character instead of timeout
          onAnimationComplete={i === lastCharIndex ? handleLastCharAnimationComplete : undefined}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
});

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
 * <StreamingBlock isStreaming={isSynthesizing}>
 *   <SynthesisContent data={synthesisData} />
 * </StreamingBlock>
 * ```
 */
export const StreamingBlock = memo(({
  isStreaming = false,
  children,
  className,
}: StreamingBlockProps) => {
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
export const StreamingParagraph = memo(({
  children,
  isStreaming = false,
  className,
}: StreamingParagraphProps) => {
  const lastTextRef = useRef(children);
  const [isGrowing, setIsGrowing] = useState(false);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (children.length > lastTextRef.current.length) {
      setIsGrowing(true);

      // ✅ FIX: Use double-rAF pattern instead of setTimeout
      // This ensures the "growing" visual state is shown for at least one full frame
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = requestAnimationFrame(() => {
          setIsGrowing(false);
          rafIdRef.current = null;
        });
      });
      lastTextRef.current = children;

      return () => {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
      };
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
export const StreamingCursor = memo(({
  show = true,
  className,
}: StreamingCursorProps) => {
  if (!show) {
    return null;
  }

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
export const StreamingMarkdown = memo(({
  children,
  isStreaming = false,
  className,
}: StreamingMarkdownProps) => {
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

StreamingText.displayName = 'StreamingText';
