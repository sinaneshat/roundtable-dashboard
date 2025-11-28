'use client';

import { AnimatePresence, motion, type HTMLMotionProps, type Variants } from 'motion/react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

// =============================================================================
// ANIMATION CONSTANTS - Consistent timing and easing across all components
// =============================================================================

export const ANIMATION_DURATION = {
  fast: 0.15,
  normal: 0.25,
  slow: 0.35,
} as const;

export const ANIMATION_EASE = {
  // Standard ease for most animations
  standard: [0.32, 0.72, 0, 1] as const,
  // For enter/exit animations
  enter: [0, 0, 0.2, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
  // Spring-like for layout animations
  spring: [0.25, 0.1, 0.25, 1] as const,
} as const;

// Layout transition for height/accordion animations
export const layoutTransition = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 40,
  mass: 1,
};

// =============================================================================
// STREAMING LIST COMPONENTS - For content that grows during streaming
// =============================================================================

type AnimatedStreamingListProps = {
  children: ReactNode;
  className?: string;
  /** Unique ID for the layout group to prevent conflicts */
  groupId?: string;
};

/**
 * Container for lists that grow during streaming.
 * ✅ SIMPLIFIED: No animations - items appear instantly.
 * Only the typing effect inside items should be animated.
 *
 * @example
 * ```tsx
 * <AnimatedStreamingList groupId="search-results">
 *   {items.map((item, i) => (
 *     <AnimatedStreamingItem key={item.id} index={i}>
 *       {item.content}
 *     </AnimatedStreamingItem>
 *   ))}
 * </AnimatedStreamingList>
 * ```
 */
export function AnimatedStreamingList({
  children,
  className,
  groupId: _groupId,
}: AnimatedStreamingListProps) {
  // ✅ No animations - render children directly
  return (
    <div className={cn(className)}>
      {children}
    </div>
  );
}

type AnimatedStreamingItemProps = {
  children: ReactNode;
  className?: string;
  /** Unique key for AnimatePresence tracking */
  itemKey: string;
  /** Index for staggered animations */
  index?: number;
  /** Base delay before animation starts */
  delay?: number;
  /** Stagger delay multiplier per item (default: 0.04 = 40ms) */
  staggerDelay?: number;
  /**
   * Skip initial animation (for already-complete content on page load)
   * When true, component renders in final state without animation
   * Use for pre-existing content that shouldn't animate on initial render
   */
  skipAnimation?: boolean;
};

/**
 * Individual item in a streaming list.
 * ✅ SIMPLIFIED: No animations - items appear instantly.
 * Only the typing effect inside items should be animated.
 */
export function AnimatedStreamingItem({
  children,
  className,
  itemKey: _itemKey,
  index: _index = 0,
  delay: _delay = 0,
  staggerDelay: _staggerDelay = 0.04,
  skipAnimation: _skipAnimation = false,
}: AnimatedStreamingItemProps) {
  // ✅ No animations - render children directly
  return (
    <div className={cn(className)}>
      {children}
    </div>
  );
}

// =============================================================================
// ACCORDION/COLLAPSIBLE CONTENT ANIMATION
// =============================================================================

type AnimatedAccordionContentProps = {
  children: ReactNode;
  className?: string;
  /** Whether the content is visible */
  isOpen: boolean;
  /** Callback when animation completes */
  onAnimationComplete?: () => void;
};

/**
 * Animated content wrapper for accordion/collapsible components.
 * Uses layout animations for smooth height transitions.
 *
 * @example
 * ```tsx
 * <AnimatedAccordionContent isOpen={isExpanded}>
 *   <div>Collapsible content here</div>
 * </AnimatedAccordionContent>
 * ```
 */
export function AnimatedAccordionContent({
  children,
  className,
  isOpen,
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
              },
              opacity: { duration: ANIMATION_DURATION.fast, delay: 0.05 },
            }
          }}
          exit={{
            opacity: 0,
            height: 0,
            transition: {
              height: {
                type: 'spring',
                stiffness: 500,
                damping: 40,
              },
              opacity: { duration: ANIMATION_DURATION.fast },
            }
          }}
          onAnimationComplete={onAnimationComplete}
          className={cn('overflow-hidden', className)}
        >
          <motion.div layout>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// SECTION ANIMATIONS - For analysis sections and cards
// =============================================================================

type AnimatedSectionProps = {
  children: ReactNode;
  className?: string;
  /** Unique key for layout animations */
  sectionKey?: string;
  /** Index for staggered animations */
  index?: number;
};

/**
 * Animated section wrapper with layout support.
 * Use for sections that may appear/disappear during streaming.
 */
export function AnimatedSection({
  children,
  className,
  sectionKey,
  index = 0,
}: AnimatedSectionProps) {
  const variants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 24,
        delay: index * 0.1,
      },
    },
  };

  return (
    <motion.div
      layout
      layoutId={sectionKey}
      variants={variants}
      initial="hidden"
      animate="visible"
      className={cn(className)}
      transition={{
        layout: layoutTransition,
      }}
    >
      {children}
    </motion.div>
  );
}

// =============================================================================
// STAGGER CONTAINER WITH LAYOUT SUPPORT
// =============================================================================

type AnimatedStaggerContainerProps = {
  children: ReactNode;
  className?: string;
  /** Delay between each child animation */
  staggerDelay?: number;
  /** Initial delay before first child animates */
  delayChildren?: number;
  /** Enable layout animations for height changes */
  enableLayout?: boolean;
};

/**
 * Container that staggers children animations with optional layout support.
 */
export function AnimatedStaggerContainer({
  children,
  className,
  staggerDelay = 0.08,
  delayChildren = 0.1,
  enableLayout = true,
}: AnimatedStaggerContainerProps) {
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren,
      },
    },
  };

  return (
    <motion.div
      layout={enableLayout}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={cn(className)}
      transition={enableLayout ? { layout: layoutTransition } : undefined}
    >
      {children}
    </motion.div>
  );
}

type AnimatedStaggerItemProps = {
  children: ReactNode;
  className?: string;
  /** Enable layout animations */
  enableLayout?: boolean;
};

/**
 * Child item for AnimatedStaggerContainer with coordinated animations.
 */
export function AnimatedStaggerItem({
  children,
  className,
  enableLayout = true,
}: AnimatedStaggerItemProps) {
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: ANIMATION_DURATION.normal,
        ease: ANIMATION_EASE.standard,
      },
    },
  };

  return (
    <motion.div
      layout={enableLayout}
      variants={itemVariants}
      className={cn(className)}
      transition={enableLayout ? { layout: layoutTransition } : undefined}
    >
      {children}
    </motion.div>
  );
}

// Subtle animation variants
const defaultFadeIn: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 }
};

const defaultScaleIn: Variants = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 }
};

const defaultSlideIn: Variants = {
  initial: { opacity: 0, x: -8 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 8 }
};

const staggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }
  }
};

// Base motion component props
interface MotionComponentProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}

// FadeIn Component
export function FadeIn({ 
  children, 
  className, 
  delay = 0, 
  duration = 0.2,
  variants = defaultFadeIn,
  ...props 
}: MotionComponentProps & { variants?: Variants }) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      transition={{ 
        duration, 
        delay,
        ease: [0.25, 0.1, 0.25, 1]
      }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ScaleIn Component
export function ScaleIn({ 
  children, 
  className, 
  delay = 0, 
  duration = 0.2,
  variants = defaultScaleIn,
  ...props 
}: MotionComponentProps & { variants?: Variants }) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      transition={{ 
        duration, 
        delay,
        ease: [0.25, 0.1, 0.25, 1]
      }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// SlideIn Component
export function SlideIn({ 
  children, 
  className, 
  delay = 0, 
  duration = 0.2,
  variants = defaultSlideIn,
  ...props 
}: MotionComponentProps & { variants?: Variants }) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      transition={{ 
        duration, 
        delay,
        ease: [0.25, 0.1, 0.25, 1]
      }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// StaggerContainer Component
export function StaggerContainer({ 
  children, 
  className,
  staggerDelay = 0.1,
  delayChildren = 0.1,
  ...props 
}: MotionComponentProps & { 
  staggerDelay?: number;
  delayChildren?: number;
}) {
  const containerVariants: Variants = {
    initial: {},
    animate: {
      transition: {
        staggerChildren: staggerDelay,
        delayChildren
      }
    }
  };

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={containerVariants}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// StaggerItem Component
export function StaggerItem({ 
  children, 
  className,
  variants = staggerItem,
  ...props 
}: MotionComponentProps & { variants?: Variants }) {
  return (
    <motion.div
      variants={variants}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// Simple wrapper without hover effects - for initial load only
export function SimpleMotion({ 
  children, 
  className,
  delay: _delay,
  duration: _duration,
  ...props 
}: MotionComponentProps) {
  return (
    <div
      className={cn(className)}
      {...(props as React.HTMLAttributes<HTMLDivElement>)}
    >
      {children}
    </div>
  );
}

// Page transition wrapper
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <FadeIn 
      className={cn('h-full', className)}
      duration={0.2}
    >
      {children}
    </FadeIn>
  );
}