'use client';

/* eslint-disable react-hooks-extra/no-direct-set-state-in-use-effect -- Animation state machine requires direct state updates via setTimeout callbacks */

import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/ui/cn';

import { ANIMATION_EASE } from './motion';

type TypewriterTitleProps = {
  /** The current title to display */
  title: string;
  /** Optional className for the container */
  className?: string;
  /** Speed of character animation in ms (default: 30) */
  charDelay?: number;
  /** Whether to animate on initial mount (default: false) */
  animateOnMount?: boolean;
};

/**
 * TypewriterTitle - Animated title with typing effect for title changes
 *
 * When the title changes, animates the old title "typing out" (deleting)
 * and new title "typing in" for a smooth, AI-like transition effect.
 *
 * Used in sidebar chat list when AI generates a new title for threads.
 *
 * @example
 * ```tsx
 * <TypewriterTitle title={chat.title} className="truncate" />
 * ```
 */
function TypewriterTitleComponent({
  title,
  className,
  charDelay = 25,
  animateOnMount = false,
}: TypewriterTitleProps) {
  const [displayedTitle, setDisplayedTitle] = useState(animateOnMount ? '' : title);
  const [isAnimating, setIsAnimating] = useState(animateOnMount);
  const previousTitleRef = useRef(title);
  const animationRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(false);

  // Animation function - updates state to show typing effect
  const animateTyping = useCallback((from: string, to: string, delay: number) => {
    let currentText = from;
    let phase: 'deleting' | 'typing' = 'deleting';
    let charIndex = from.length;

    const tick = () => {
      if (phase === 'deleting') {
        if (charIndex > 0) {
          charIndex--;
          currentText = from.slice(0, charIndex);
          setDisplayedTitle(currentText);
          animationRef.current = setTimeout(tick, delay * 0.6);
        } else {
          phase = 'typing';
          charIndex = 0;
          animationRef.current = setTimeout(tick, delay);
        }
      } else {
        if (charIndex < to.length) {
          charIndex++;
          currentText = to.slice(0, charIndex);
          setDisplayedTitle(currentText);
          animationRef.current = setTimeout(tick, delay);
        } else {
          setIsAnimating(false);
          animationRef.current = null;
        }
      }
    };

    tick();
  }, []);

  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      if (animateOnMount) {
        setIsAnimating(true);
        animateTyping('', title, charDelay);
      }
      return;
    }

    if (previousTitleRef.current === title) {
      return;
    }

    const oldTitle = previousTitleRef.current;
    previousTitleRef.current = title;

    if (animationRef.current) {
      clearTimeout(animationRef.current);
    }

    setIsAnimating(true);
    animateTyping(oldTitle, title, charDelay);

    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, [title, charDelay, animateOnMount, animateTyping]);

  return (
    <span className={cn('inline-flex items-center min-w-0', className)}>
      <AnimatePresence mode="wait">
        <motion.span
          key={isAnimating ? 'animating' : 'static'}
          initial={{ opacity: 0.8 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0.8 }}
          transition={{ duration: 0.1, ease: ANIMATION_EASE.standard }}
          className="truncate overflow-hidden text-ellipsis whitespace-nowrap"
        >
          {displayedTitle}
          {isAnimating && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="inline-block w-[2px] h-[1em] bg-current ml-0.5 align-middle"
            />
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export const TypewriterTitle = memo(TypewriterTitleComponent);
