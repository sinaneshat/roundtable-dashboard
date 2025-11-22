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
}: TypingTextProps) {
  const [displayedText, setDisplayedText] = useState(enabled ? '' : text);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // If not enabled or speed is 0, display instantly
    if (!enabled || speed === 0) {
      setDisplayedText(text);
      setCurrentIndex(text.length);
      onComplete?.();
      return undefined;
    }

    setDisplayedText('');
    setCurrentIndex(0);

    // ✅ MEMORY LEAK FIX: Store interval ID in variable to properly clean up
    let intervalId: NodeJS.Timeout | null = null;

    const startTimeout = setTimeout(() => {
      intervalId = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= text.length) {
            if (intervalId) clearInterval(intervalId);
            onComplete?.();
            return prev;
          }
          setDisplayedText(text.slice(0, prev + 1));
          return prev + 1;
        });
      }, speed);
    }, delay);

    // ✅ MEMORY LEAK FIX: Clean up BOTH timeout AND interval
    return () => {
      clearTimeout(startTimeout);
      if (intervalId) clearInterval(intervalId);
    };
  }, [text, speed, delay, onComplete, enabled]);

  return (
    <span className={className}>
      {displayedText}
      {enabled && speed > 0 && currentIndex < text.length && (
        <motion.span
          className="inline-block w-0.5 h-[1em] ml-0.5 bg-current align-middle"
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.8, repeat: Infinity }}
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
