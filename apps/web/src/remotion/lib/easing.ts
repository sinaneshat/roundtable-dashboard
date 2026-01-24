/**
 * Spring and Easing Configurations
 * Reusable animation configs for Remotion spring() and interpolate()
 */

import type { SpringConfig } from 'remotion';

// Spring configs (for Remotion spring())
export const SPRING_CONFIGS = {
  // Smooth, no bounce - for subtle reveals
  smooth: { damping: 200 } satisfies Partial<SpringConfig>,

  // Snappy with minimal bounce - for UI elements
  snappy: { damping: 20, stiffness: 200 } satisfies Partial<SpringConfig>,

  // Bouncy entrance - for playful animations
  bouncy: { damping: 8 } satisfies Partial<SpringConfig>,

  // Heavy/slow - for dramatic elements
  heavy: { damping: 15, stiffness: 80, mass: 2 } satisfies Partial<SpringConfig>,

  // Quick pop - for badges/icons appearing
  pop: { damping: 12, stiffness: 300 } satisfies Partial<SpringConfig>,

  // Gentle float - for subtle movements
  gentle: { damping: 30, stiffness: 50 } satisfies Partial<SpringConfig>,
} as const;

// Standard animation durations (in frames at 30fps)
export const DURATIONS = {
  instant: 6, // 0.2s
  fast: 12, // 0.4s
  normal: 18, // 0.6s
  slow: 30, // 1s
  verySlow: 45, // 1.5s
} as const;

// Stagger delays for sequential animations
export const STAGGER = {
  tight: 2, // ~66ms between items
  normal: 4, // ~133ms
  relaxed: 6, // ~200ms
  wide: 10, // ~333ms
} as const;
