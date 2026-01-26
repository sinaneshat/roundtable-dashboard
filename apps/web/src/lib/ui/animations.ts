import type { Variants } from 'motion/react';

/**
 * Simple, reusable animation variants
 * Uses opacity-only transitions to avoid height/layout issues
 * Order of execution is controlled via staggerChildren
 */

// Container that staggers children - opacity stays 1 to avoid layout issues
export const staggerContainer: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      when: 'beforeChildren',
    },
  },
};

// Standard item fade-in
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2 },
  },
};

// Faster fade for list items
export const fastFadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.15 },
  },
};

// ============================================================================
// TYPING ANIMATION CONSTANTS
// ============================================================================

// Chars per frame for natural typing effect
export const TYPING_CHARS_PER_FRAME = 3;

// Milliseconds between character additions
export const TYPING_FRAME_INTERVAL = 15;
