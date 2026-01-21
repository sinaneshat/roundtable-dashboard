/**
 * Animation Constants - Unified System
 *
 * **SINGLE SOURCE OF TRUTH**: All Framer Motion animations across the app
 * Ensures consistent timing, easing, and behavior
 *
 * Based on Framer Motion best practices for stagger animations and transitions
 *
 * @module constants/animations
 */

// ============================================================================
// ANIMATION TIMINGS - Duration and delay constants in seconds
// ============================================================================

/**
 * Animation timing constants
 * Use these instead of hardcoded values for consistency
 */
export const ANIMATION_TIMINGS = {
  // ========================================
  // Simple durations (use for most cases)
  // ========================================
  /** Quick micro-interactions (0.15s) */
  FAST: 0.15,
  /** Default animation duration (0.3s) */
  NORMAL: 0.3,
  /** Slower, more noticeable animations (0.5s) */
  SLOW: 0.5,
  /** Very slow, deliberate animations (1s) */
  VERY_SLOW: 1.0,

  // ========================================
  // Detailed durations (more granular control)
  // ========================================
  /** Almost instant (0.15s) - Same as FAST */
  DURATION_INSTANT: 0.15,
  /** Quick transitions (0.2s) */
  DURATION_FAST: 0.2,
  /** Standard transitions (0.3s) - Same as NORMAL */
  DURATION_NORMAL: 0.3,
  /** Slow, emphasized transitions (0.4s) */
  DURATION_SLOW: 0.4,

  // ========================================
  // Stagger delays (time between each child animation)
  // ========================================
  /** For small items (badges, icons) */
  STAGGER_FAST: 0.05,
  /** For medium items (list items, text lines) */
  STAGGER_NORMAL: 0.08,
  /** For large sections (cards, major components) */
  STAGGER_SLOW: 0.12,
  /** For very large sections (full accordions) */
  STAGGER_VERY_SLOW: 0.15,

  // ========================================
  // Initial delays (before animation starts)
  // ========================================
  /** No delay */
  DELAY_NONE: 0,
  /** Short delay (0.1s) */
  DELAY_SHORT: 0.1,
  /** Medium delay (0.2s) */
  DELAY_MEDIUM: 0.2,
  /** Long delay (0.3s) */
  DELAY_LONG: 0.3,
} as const;

// ============================================================================
// ANIMATION EASING - Timing functions
// ============================================================================

/**
 * Easing curves for smooth animations
 * Use these for consistent motion feel
 */
export const ANIMATION_EASING = {
  // ========================================
  // Cubic bezier curves
  // ========================================
  /** Custom smooth, natural motion [0.32, 0.72, 0, 1] */
  DEFAULT: [0.32, 0.72, 0, 1] as const,
  /** Linear interpolation [0, 0, 1, 1] */
  LINEAR: [0, 0, 1, 1] as const,
  /** Smooth ease in and out [0.4, 0, 0.2, 1] */
  EASE: [0.4, 0, 0.2, 1] as const,
  /** Ease in - slow start [0.4, 0, 1, 1] */
  EASE_IN: [0.4, 0, 1, 1] as const,
  /** Ease out - slow end [0, 0, 0.2, 1] */
  EASE_OUT: [0, 0, 0.2, 1] as const,
  /** Snappy, bouncy entrance [0.68, -0.55, 0.265, 1.55] */
  BOUNCE: [0.68, -0.55, 0.265, 1.55] as const,

  // ========================================
  // Spring physics (use SPRING_CONFIGS for more control)
  // ========================================
  /** Standard spring for bouncy, natural feel */
  SPRING: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 24,
  },
  /** Gentle spring for subtle motion */
  SPRING_GENTLE: {
    type: 'spring' as const,
    stiffness: 200,
    damping: 20,
  },

  // ========================================
  // Specialized configs
  // ========================================
  /** Layout animations (for height/width changes) */
  LAYOUT: {
    duration: ANIMATION_TIMINGS.DURATION_FAST,
    ease: [0.32, 0.72, 0, 1] as const,
  },
} as const;

// ============================================================================
// SPRING CONFIGURATIONS - Physics-based animations
// ============================================================================

/**
 * Spring animation presets for natural motion
 * Use these for physics-based animations with spring characteristics
 */
export const SPRING_CONFIGS = {
  /** Gentle spring (default) - stiffness: 300, damping: 24 */
  GENTLE: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 24,
  },
  /** Bouncy spring - stiffness: 400, damping: 17 */
  BOUNCY: {
    type: 'spring' as const,
    stiffness: 400,
    damping: 17,
  },
  /** Stiff, immediate response - stiffness: 500, damping: 30 */
  STIFF: {
    type: 'spring' as const,
    stiffness: 500,
    damping: 30,
  },
  /** Subtle, gentle spring - stiffness: 200, damping: 20 */
  SUBTLE: {
    type: 'spring' as const,
    stiffness: 200,
    damping: 20,
  },
} as const;

// ============================================================================
// ANIMATION VARIANTS - Reusable motion configs
// ============================================================================

/**
 * Common animation variants
 * Reusable variants for consistent animations across components
 */
export const ANIMATION_VARIANTS = {
  /**
   * Fade in from bottom
   * Usage: <motion.div variants={ANIMATION_VARIANTS.fadeInUp} initial="hidden" animate="show" />
   */
  fadeInUp: {
    hidden: { opacity: 0, y: 20 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: ANIMATION_TIMINGS.DURATION_NORMAL,
        ease: ANIMATION_EASING.DEFAULT,
      },
    },
  },

  /**
   * Fade in from top
   * Usage: <motion.div variants={ANIMATION_VARIANTS.fadeInDown} initial="hidden" animate="show" />
   */
  fadeInDown: {
    hidden: { opacity: 0, y: -10 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: ANIMATION_TIMINGS.DURATION_FAST,
        ease: ANIMATION_EASING.DEFAULT,
      },
    },
  },

  /**
   * Simple fade
   * Usage: <motion.div variants={ANIMATION_VARIANTS.fade} initial="hidden" animate="show" />
   */
  fade: {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        duration: ANIMATION_TIMINGS.DURATION_NORMAL,
        ease: ANIMATION_EASING.DEFAULT,
      },
    },
  },

  /**
   * Container for staggered children (normal speed)
   * Usage: <motion.div variants={ANIMATION_VARIANTS.staggerContainer}>
   *          <motion.div variants={ANIMATION_VARIANTS.staggerItem} />
   *        </motion.div>
   */
  staggerContainer: {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: ANIMATION_TIMINGS.STAGGER_NORMAL,
        delayChildren: ANIMATION_TIMINGS.DELAY_SHORT,
        when: 'beforeChildren' as const,
      },
    },
  },

  /**
   * Container for staggered children (slow speed - for major sections)
   */
  staggerContainerSlow: {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: ANIMATION_TIMINGS.STAGGER_SLOW,
        delayChildren: ANIMATION_TIMINGS.DELAY_MEDIUM,
        when: 'beforeChildren' as const,
      },
    },
  },

  /**
   * Item within staggered container
   * Use with staggerContainer or staggerContainerSlow
   */
  staggerItem: {
    hidden: { opacity: 0, y: 10 },
    show: {
      opacity: 1,
      y: 0,
      transition: ANIMATION_EASING.SPRING,
    },
  },
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create custom stagger container variant
 *
 * @param staggerDelay - Delay between each child in seconds (default: STAGGER_NORMAL)
 * @param initialDelay - Delay before first child in seconds (default: DELAY_SHORT)
 * @returns Motion variant for staggered container
 *
 * @example
 * ```tsx
 * const customStagger = createStaggerContainer(0.1, 0.2);
 * <motion.div variants={customStagger}>
 *   <motion.div variants={ANIMATION_VARIANTS.staggerItem} />
 * </motion.div>
 * ```
 */
export function createStaggerContainer(
  staggerDelay: number = ANIMATION_TIMINGS.STAGGER_NORMAL,
  initialDelay: number = ANIMATION_TIMINGS.DELAY_SHORT,
) {
  return {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: initialDelay,
        when: 'beforeChildren' as const,
      },
    },
  };
}
