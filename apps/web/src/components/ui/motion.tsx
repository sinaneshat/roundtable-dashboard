import type { HTMLMotionProps, Variants } from 'motion/react';
import { LayoutGroup, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';

import { cn } from '@/lib/ui/cn';

// =============================================================================
// SSR DETECTION - Ensures content is visible on first paint
// =============================================================================

/**
 * SSR-safe client detection using useSyncExternalStore.
 * Returns false on server, true on client after hydration.
 * Used to skip opacity:0 animations during SSR.
 */
function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true, // Client: mounted
    () => false, // Server: not mounted
  );
}

// Re-export LayoutGroup for use in parent components that need to coordinate animations
export { LayoutGroup };

// =============================================================================
// ANIMATION CONSTANTS - Consistent timing and easing across all components
// =============================================================================

export const ANIMATION_DURATION = {
  fast: 0.15,
  normal: 0.25,
  slow: 0.35,
} as const;

export const ANIMATION_EASE = {
  standard: [0.32, 0.72, 0, 1] as const,
  enter: [0, 0, 0.2, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
} as const;

// =============================================================================
// SIMPLE ENTRANCE COMPONENTS
// =============================================================================

type SimpleEntranceProps = {
  children: ReactNode;
  className?: string;
  skipAnimation?: boolean;
  index?: number;
  enableScrollEffect?: boolean;
  scrollIntensity?: number;
  skipScale?: boolean;
};

// Viewport threshold - lower value = elements stay visible longer when scrolling away
const VIEWPORT_THRESHOLD = 0.05;

/**
 * User message - fade in when scrolled into view
 * SSR-safe: renders visible content on server, animates on client
 */
export function ScrollAwareUserMessage({
  children,
  className,
  skipAnimation = false,
}: Omit<SimpleEntranceProps, 'index'>) {
  const isClient = useIsClient();

  // SSR or skipAnimation: render visible immediately
  if (!isClient || skipAnimation) {
    return <div className={cn('w-full', className)}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ amount: VIEWPORT_THRESHOLD, once: true }}
      transition={{ duration: 0.25, ease: ANIMATION_EASE.enter }}
      className={cn('w-full', className)}
    >
      {children}
    </motion.div>
  );
}

/**
 * Participant message - fade in when scrolled into view
 * SSR-safe: renders visible content on server, animates on client
 */
export function ScrollAwareParticipant({
  children,
  className,
  skipAnimation = false,
  index = 0,
}: SimpleEntranceProps) {
  const isClient = useIsClient();

  // SSR or skipAnimation: render visible immediately
  if (!isClient || skipAnimation) {
    return <div className={cn('w-full', className)}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ amount: VIEWPORT_THRESHOLD, once: true }}
      transition={{ duration: 0.25, delay: index * 0.05, ease: ANIMATION_EASE.enter }}
      className={cn('w-full', className)}
    >
      {children}
    </motion.div>
  );
}

/**
 * PreSearch card - fade in when scrolled into view
 * SSR-safe: renders visible content on server, animates on client
 */
export function ScrollFromTop({
  children,
  className,
  skipAnimation = false,
}: Omit<SimpleEntranceProps, 'index'>) {
  const isClient = useIsClient();

  // SSR or skipAnimation: render visible immediately
  if (!isClient || skipAnimation) {
    return <div className={cn('w-full', className)}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ amount: VIEWPORT_THRESHOLD, once: true }}
      transition={{ duration: 0.25, ease: ANIMATION_EASE.enter }}
      className={cn('w-full', className)}
    >
      {children}
    </motion.div>
  );
}

/**
 * Accordion card entrance - fade in when scrolled into view
 * SSR-safe: renders visible content on server, animates on client
 */
export function AccordionEntrance({
  children,
  className,
  skipAnimation = false,
}: Omit<SimpleEntranceProps, 'index'>) {
  const isClient = useIsClient();

  // SSR or skipAnimation: render visible immediately
  if (!isClient || skipAnimation) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ amount: VIEWPORT_THRESHOLD, once: true }}
      transition={{ duration: 0.25, ease: ANIMATION_EASE.enter }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}

// =============================================================================
// STREAMING LIST COMPONENTS - Layout animations for smooth height transitions
// =============================================================================

type AnimatedStreamingListProps = {
  children: ReactNode;
  className?: string;
  groupId?: string;
  isStreaming?: boolean;
};

/**
 * Container for streaming lists - no height animations
 */
export function AnimatedStreamingList({
  children,
  className,
}: AnimatedStreamingListProps) {
  return (
    <div className={cn(className)}>
      {children}
    </div>
  );
}

type AnimatedStreamingItemProps = {
  children: ReactNode;
  className?: string;
  itemKey: string;
  index?: number;
  delay?: number;
  staggerDelay?: number;
  skipAnimation?: boolean;
};

/**
 * Individual streaming item - fade in only, no height animations
 */
export function AnimatedStreamingItem({
  children,
  className,
  index = 0,
  delay = 0,
  staggerDelay = 0.03,
  skipAnimation = false,
}: AnimatedStreamingItemProps) {
  if (skipAnimation) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: ANIMATION_DURATION.normal,
        delay: delay + index * staggerDelay,
        ease: ANIMATION_EASE.enter,
      }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}

// =============================================================================
// STREAMING MESSAGE CONTENT - Smooth height transitions during text streaming
// =============================================================================

type StreamingMessageContentProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Wrapper for streaming message content
 * No height animations - content grows naturally as text streams in
 */
export function StreamingMessageContent({
  children,
  className,
}: StreamingMessageContentProps) {
  return (
    <div className={cn(className)}>
      {children}
    </div>
  );
}

// =============================================================================
// STAGGER VARIANTS (used by StaggerContainer/StaggerItem)
// =============================================================================

const staggerContainerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

const staggerItemVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.2, ease: ANIMATION_EASE.enter },
  },
};

// =============================================================================
// BASIC MOTION COMPONENTS
// =============================================================================

type MotionComponentProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
} & HTMLMotionProps<'div'>;

/**
 * Simple fade in
 */
export function FadeIn({
  children,
  className,
  delay = 0,
  duration = 0.2,
  ...props
}: MotionComponentProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration, delay, ease: ANIMATION_EASE.enter }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/**
 * Scale in animation
 */
export function ScaleIn({
  children,
  className,
  delay = 0,
  duration = 0.2,
  ...props
}: MotionComponentProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration, delay, ease: ANIMATION_EASE.enter }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/**
 * Stagger container
 */
export function StaggerContainer({
  children,
  className,
  ...props
}: MotionComponentProps & { staggerDelay?: number; delayChildren?: number }) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={staggerContainerVariants}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/**
 * Stagger item
 */
export function StaggerItem({
  children,
  className,
  ...props
}: MotionComponentProps) {
  return (
    <motion.div
      variants={staggerItemVariants}
      className={cn('w-full', className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/**
 * Page transition
 */
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <FadeIn className={cn('h-full', className)} duration={0.2}>
      {children}
    </FadeIn>
  );
}

/**
 * Scroll fade entrance - fade in when scrolled into view
 * SSR-safe: renders visible content on server, animates on client
 */
export function ScrollFadeEntrance({
  children,
  className,
  skipAnimation = false,
  index = 0,
}: SimpleEntranceProps) {
  const isClient = useIsClient();

  // SSR or skipAnimation: render visible immediately
  if (!isClient || skipAnimation) {
    return <div className={cn('w-full', className)}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ amount: VIEWPORT_THRESHOLD, once: true }}
      transition={{ duration: 0.25, delay: index * 0.03, ease: ANIMATION_EASE.enter }}
      className={cn('w-full', className)}
    >
      {children}
    </motion.div>
  );
}
