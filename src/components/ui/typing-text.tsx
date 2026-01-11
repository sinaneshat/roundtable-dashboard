'use client';

import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

type TypingTextProps = {
  text: string;
  speed?: number;
  delay?: number;
  className?: string;
  onComplete?: () => void;
  enabled?: boolean;
  /** Show streaming cursor at end of text (for external streaming control) */
  showStreamingCursor?: boolean;
};

/**
 * Reusable typing text animation component
 * Animates text character by character with configurable speed
 *
 * Speed options:
 * - speed={0}: Instant display (for real streaming - matches actual stream speed)
 * - speed={1-10}: Fast typing (for streaming UI elements)
 * - speed={10-30}: Normal typing (for demos/showcases)
 *
 * Default delay of 250ms ensures parent element is mounted and visible before typing starts
 */
export function TypingText({
  text,
  speed = 20,
  delay = 250,
  className,
  onComplete,
  enabled = true,
  showStreamingCursor = false,
}: TypingTextProps) {
  const [currentIndex, setCurrentIndex] = useState(enabled ? 0 : text.length);

  // ✅ FIX: Derive displayedText from currentIndex (no separate state)
  // Prevents nested setState calls that cause "Maximum update depth" errors
  const displayedText = text.slice(0, currentIndex);

  useEffect(() => {
    // If not enabled or speed is 0, display instantly
    if (!enabled || speed === 0) {
      setCurrentIndex(text.length);
      onComplete?.();
      return undefined;
    }

    // Reset to start of text for new animation
    setCurrentIndex(0);

    // ✅ MEMORY LEAK FIX: Store interval ID in variable to properly clean up
    let intervalId: NodeJS.Timeout | null = null;

    const startTimeout = setTimeout(() => {
      intervalId = setInterval(() => {
        setCurrentIndex((prev) => {
          const nextIndex = prev + 1;
          if (nextIndex >= text.length) {
            if (intervalId) clearInterval(intervalId);
            onComplete?.();
            return text.length;
          }
          return nextIndex;
        });
      }, speed);
    }, delay);

    // ✅ MEMORY LEAK FIX: Clean up BOTH timeout AND interval
    return () => {
      clearTimeout(startTimeout);
      if (intervalId) clearInterval(intervalId);
    };
  }, [text, speed, delay, onComplete, enabled]);

  // Show cursor during typing animation OR when externally flagged as streaming
  const showCursor = (enabled && speed > 0 && currentIndex < text.length) || showStreamingCursor;

  return (
    <span className={className}>
      {displayedText}
      {showCursor && (
        <motion.span
          className="inline-block w-0.5 h-[1em] ml-0.5 bg-primary/70 rounded-sm align-middle"
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </span>
  );
}

/**
 * Simpler version for instant reveal with fade-in animation
 */
export function FadeInText({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.span
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay }}
    >
      {children}
    </motion.span>
  );
}
