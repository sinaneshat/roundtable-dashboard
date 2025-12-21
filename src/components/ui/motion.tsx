'use client';

import type { HTMLMotionProps, Variants } from 'motion/react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

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
// SIMPLE ENTRANCE ANIMATIONS - Following motion/react official patterns
// =============================================================================

/**
 * User message entrance - fade in
 */
export const userMessageVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.2, ease: ANIMATION_EASE.enter },
  },
};

/**
 * Participant message entrance - fade in
 */
export const participantMessageVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.2, ease: ANIMATION_EASE.enter },
  },
};

/**
 * Moderator/Search cards - fade in
 */
export const slideUpVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.2, ease: ANIMATION_EASE.enter },
  },
};

/**
 * Timeline entrance - fade in
 */
export const timelineEntranceVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.2, ease: ANIMATION_EASE.enter },
  },
};

/**
 * Accordion card entrance (PreSearch, moderator) - fade in
 */
export const accordionCardVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.2, ease: ANIMATION_EASE.enter },
  },
};

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
 */
export function ScrollAwareUserMessage({
  children,
  className,
  skipAnimation = false,
}: Omit<SimpleEntranceProps, 'index'>) {
  if (skipAnimation) {
    return <div className={cn('w-full', className)}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ amount: VIEWPORT_THRESHOLD }}
      transition={{ duration: 0.25, ease: ANIMATION_EASE.enter }}
      className={cn('w-full', className)}
    >
      {children}
    </motion.div>
  );
}

/**
 * Participant message - fade in when scrolled into view
 */
export function ScrollAwareParticipant({
  children,
  className,
  skipAnimation = false,
  index = 0,
}: SimpleEntranceProps) {
  if (skipAnimation) {
    return <div className={cn('w-full', className)}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ amount: VIEWPORT_THRESHOLD }}
      transition={{ duration: 0.25, delay: index * 0.05, ease: ANIMATION_EASE.enter }}
      className={cn('w-full', className)}
    >
      {children}
    </motion.div>
  );
}

/**
 * Timeline entrance - fade in when scrolled into view
 */
export function TimelineEntrance({
  children,
  className,
  skipAnimation = false,
  index = 0,
}: SimpleEntranceProps) {
  if (skipAnimation) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ amount: VIEWPORT_THRESHOLD }}
      transition={{ duration: 0.25, delay: index * 0.03, ease: ANIMATION_EASE.enter }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}

/**
 * PreSearch card - fade in when scrolled into view
 */
export function ScrollFromTop({
  children,
  className,
  skipAnimation = false,
}: Omit<SimpleEntranceProps, 'index'>) {
  if (skipAnimation) {
    return <div className={cn('w-full', className)}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ amount: VIEWPORT_THRESHOLD }}
      transition={{ duration: 0.25, ease: ANIMATION_EASE.enter }}
      className={cn('w-full', className)}
    >
      {children}
    </motion.div>
  );
}

/**
 * Moderator card - fade in when scrolled into view
 */
export function ScrollFromBottom({
  children,
  className,
  skipAnimation = false,
}: Omit<SimpleEntranceProps, 'index'>) {
  if (skipAnimation) {
    return <div className={cn('w-full', className)}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ amount: VIEWPORT_THRESHOLD }}
      transition={{ duration: 0.25, ease: ANIMATION_EASE.enter }}
      className={cn('w-full', className)}
    >
      {children}
    </motion.div>
  );
}

/**
 * User message entrance - alias for ScrollAwareUserMessage
 */
export function UserMessageEntrance({
  children,
  className,
  skipAnimation = false,
}: Omit<SimpleEntranceProps, 'index'>) {
  return (
    <ScrollAwareUserMessage skipAnimation={skipAnimation} className={className}>
      {children}
    </ScrollAwareUserMessage>
  );
}

/**
 * Participant entrance - alias for ScrollAwareParticipant
 */
export function ParticipantEntrance({
  children,
  className,
  skipAnimation = false,
  index = 0,
}: SimpleEntranceProps) {
  return (
    <ScrollAwareParticipant skipAnimation={skipAnimation} index={index} className={className}>
      {children}
    </ScrollAwareParticipant>
  );
}

/**
 * Accordion card entrance - fade in when scrolled into view
 */
export function AccordionEntrance({
  children,
  className,
  skipAnimation = false,
}: Omit<SimpleEntranceProps, 'index'>) {
  if (skipAnimation) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ amount: VIEWPORT_THRESHOLD }}
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
// ACCORDION CONTENT - Smooth height animations with AnimatePresence
// =============================================================================

type AnimatedAccordionContentProps = {
  children: ReactNode;
  className?: string;
  isOpen: boolean;
  isStreaming?: boolean;
  onAnimationComplete?: () => void;
};

/**
 * Animated accordion content - smooth height transition using auto height
 * Uses Motion's unique ability to animate to/from height: 'auto'
 */
export function AnimatedAccordionContent({
  children,
  className,
  isOpen,
  isStreaming,
  onAnimationComplete,
}: AnimatedAccordionContentProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {isOpen && (
        <motion.div
          layout
          initial={{ opacity: 0, height: 0 }}
          animate={{
            opacity: 1,
            height: 'auto',
            transition: {
              height: {
                type: 'spring',
                stiffness: 500,
                damping: 40,
                mass: 0.8,
              },
              opacity: { duration: 0.2, ease: ANIMATION_EASE.enter },
            },
          }}
          exit={{
            opacity: 0,
            height: 0,
            transition: {
              height: { duration: 0.2, ease: ANIMATION_EASE.exit },
              opacity: { duration: 0.15, ease: ANIMATION_EASE.exit },
            },
          }}
          onAnimationComplete={onAnimationComplete}
          className={cn('overflow-hidden', className)}
        >
          {/* Inner container with layout for smooth content changes during streaming */}
          <motion.div
            layout={isStreaming}
            transition={{
              layout: {
                type: 'spring',
                stiffness: 400,
                damping: 30,
              },
            }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// STREAMING MESSAGE CONTENT - Smooth height transitions during text streaming
// =============================================================================

type StreamingMessageContentProps = {
  children: ReactNode;
  className?: string;
  isStreaming?: boolean;
  layoutId?: string;
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
// SECTION ANIMATIONS - Simple entrance
// =============================================================================

type AnimatedSectionProps = {
  children: ReactNode;
  className?: string;
  sectionKey?: string;
  index?: number;
  disableLayoutDuringStreaming?: boolean;
};

/**
 * Animated section - fade in only, no height animations
 */
export function AnimatedSection({
  children,
  className,
  index = 0,
}: AnimatedSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: 0.2,
        delay: index * 0.05,
        ease: ANIMATION_EASE.enter,
      }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}

// =============================================================================
// STAGGER CONTAINERS - Simple stagger without layout
// =============================================================================

type AnimatedStaggerContainerProps = {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
  delayChildren?: number;
  enableLayout?: boolean;
};

const staggerContainerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

/**
 * Container that staggers children animations
 */
export function AnimatedStaggerContainer({
  children,
  className,
}: AnimatedStaggerContainerProps) {
  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="initial"
      animate="animate"
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}

type AnimatedStaggerItemProps = {
  children: ReactNode;
  className?: string;
  enableLayout?: boolean;
};

const staggerItemVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.2, ease: ANIMATION_EASE.enter },
  },
};

/**
 * Child item for stagger container
 */
export function AnimatedStaggerItem({
  children,
  className,
}: AnimatedStaggerItemProps) {
  return (
    <motion.div
      variants={staggerItemVariants}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}

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
 * Fade in (formerly slide in)
 */
export function SlideIn({
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
 * Simple wrapper - no animation
 */
export function SimpleMotion({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(className)}>{children}</div>;
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

export const layoutTransition = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 40,
  mass: 1,
};

export const timelineStaggerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

// Scroll-related exports - now just simple wrappers
export function ScrollMagnifier({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('w-full', className)}>{children}</div>;
}

export function ScrollFadeEntrance({
  children,
  className,
  skipAnimation = false,
  index = 0,
}: SimpleEntranceProps) {
  if (skipAnimation) {
    return <div className={cn('w-full', className)}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ amount: VIEWPORT_THRESHOLD }}
      transition={{ duration: 0.25, delay: index * 0.03, ease: ANIMATION_EASE.enter }}
      className={cn('w-full', className)}
    >
      {children}
    </motion.div>
  );
}
