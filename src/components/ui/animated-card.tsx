'use client';

import { motion } from 'motion/react';
import type { HTMLMotionProps } from 'motion/react';

import { cn } from '@/lib/ui/cn';

type AnimatedCardProps = HTMLMotionProps<'div'> & {
  delay?: number;
  staggerIndex?: number;
  staggerDelay?: number;
};

/**
 * Reusable animated card component with consistent animation patterns
 * Use for all card-like elements that need to appear with animation
 */
export function AnimatedCard({
  children,
  delay = 0,
  staggerIndex = 0,
  staggerDelay = 0.05,
  className,
  ...props
}: AnimatedCardProps) {
  const totalDelay = delay + (staggerIndex * staggerDelay);

  return (
    <motion.div
      className={cn(className)}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.25,
        delay: totalDelay,
        ease: [0.32, 0.72, 0, 1],
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/**
 * Animated list item with stagger support
 */
export function AnimatedListItem({
  children,
  index = 0,
  className,
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.2,
        delay: index * 0.04,
        ease: [0.32, 0.72, 0, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Animated badge/pill component
 */
export function AnimatedBadge({
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
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.2,
        delay,
        ease: [0.32, 0.72, 0, 1],
      }}
    >
      {children}
    </motion.span>
  );
}
