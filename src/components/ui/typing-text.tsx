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
 */
export function TypingText({
  text,
  speed = 20,
  delay = 0,
  className,
  onComplete,
  enabled = true,
}: TypingTextProps) {
  const [displayedText, setDisplayedText] = useState(enabled ? '' : text);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setDisplayedText(text);
      onComplete?.();
      return;
    }

    setDisplayedText('');
    setCurrentIndex(0);

    const startTimeout = setTimeout(() => {
      const interval = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= text.length) {
            clearInterval(interval);
            onComplete?.();
            return prev;
          }
          setDisplayedText(text.slice(0, prev + 1));
          return prev + 1;
        });
      }, speed);

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(startTimeout);
  }, [text, speed, delay, onComplete, enabled]);

  return (
    <span className={className}>
      {displayedText}
      {enabled && currentIndex < text.length && (
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
