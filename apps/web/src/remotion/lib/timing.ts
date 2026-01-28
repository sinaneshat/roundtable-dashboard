/**
 * Video Timing Configuration
 * Frame-based timing utilities for Remotion compositions
 */

export const FPS = 30;

// Product Hunt Demo (15 seconds total = 450 frames)
export const PRODUCT_HUNT = {
  FPS,
  DURATION_SECONDS: 15,
  DURATION_FRAMES: 15 * FPS, // 450

  // Scene breakdown
  INTRO: {
    START: 0,
    END: 3 * FPS, // 90 frames
    DURATION: 3 * FPS,
  },
  DEMO: {
    START: 3 * FPS, // 90
    END: 10 * FPS, // 300
    DURATION: 7 * FPS, // 210 frames
  },
  FEATURES: {
    START: 10 * FPS, // 300
    END: 12 * FPS, // 360
    DURATION: 2 * FPS, // 60 frames
  },
  CTA: {
    START: 12 * FPS, // 360
    END: 15 * FPS, // 450
    DURATION: 3 * FPS, // 90 frames
  },
} as const;

// Transition durations
export const TRANSITIONS = {
  FADE: 15, // 0.5s at 30fps
  QUICK_FADE: 8, // ~0.25s
  SLIDE: 20, // ~0.66s
} as const;

// Animation timing helpers
export function secondsToFrames(seconds: number, fps: number = FPS): number {
  return Math.round(seconds * fps);
}

export function framesToSeconds(frames: number, fps: number = FPS): number {
  return frames / fps;
}

// Delay helper for staggered animations
export function staggerDelay(index: number, delayPerItem = 3): number {
  return index * delayPerItem;
}
