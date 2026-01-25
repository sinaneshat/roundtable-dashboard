/**
 * Music Timing Configuration for RoundtableShowcase
 *
 * Uses beat-matched spliced audio cut at phrase boundaries (BPM: 116)
 * Segments from original track aligned to video scenes:
 *
 * Audio Structure (showcase-spliced.mp3):
 *   0-6s:    Intro (from 1.68s in original - soft)
 *   6-14s:   Homepage+Sidebar (from 17.65s - building)
 *   14-50s:  ChatInput (from 34.65s - features)
 *   50-63s:  ModelModal (from 131.16s - peak setup)
 *   63-84s:  ChatThread (from 163.15s - THE DROP!)
 *   84-89s:  Finale (from 195.15s - fadeout)
 *
 * Cuts made at 8-bar phrase boundaries for seamless loops.
 */

export const FPS = 30;

// ============================================================================
// SCENE TIMING REFERENCE
// ============================================================================

export const SCENES = {
  intro: { start: 0, end: 150, duration: 150, seconds: 5 },
  homepage: { start: 150, end: 276, duration: 126, seconds: 4.2 },
  sidebar: { start: 276, end: 381, duration: 105, seconds: 3.5 },
  chatInput: { start: 381, end: 1446, duration: 1065, seconds: 35.5 },
  modelModal: { start: 1446, end: 1812, duration: 366, seconds: 12.2 },
  chatThread: { start: 1812, end: 2418, duration: 606, seconds: 20.2 },
  finale: { start: 2418, end: 2532, duration: 114, seconds: 3.8 },
} as const;

// ============================================================================
// ENERGY LEVELS BY SCENE
// Use this to guide animation intensity
// ============================================================================

export type EnergyLevel = 'low' | 'building' | 'medium' | 'high' | 'peak' | 'resolving';

export const SCENE_ENERGY: Record<keyof typeof SCENES, EnergyLevel> = {
  intro: 'low',
  homepage: 'building',
  sidebar: 'medium',
  chatInput: 'building', // Gradual build through long section
  modelModal: 'high',
  chatThread: 'peak', // THE DROP!
  finale: 'resolving',
};

// ============================================================================
// TRANSITION FRAMES (for chromatic aberration, audio boosts, etc.)
// ============================================================================

export const TRANSITION_FRAMES = [150, 276, 381, 1446, 1812, 2418];

// ============================================================================
// KEY MOMENTS (for special audio/visual treatment)
// ============================================================================

export const KEY_MOMENTS = {
  logoReveal: 30, // Logo animation starts
  sendButton: 1400, // User "sends" message
  theDrop: 1812, // ChatThread starts - PEAK moment
  moderatorSynthesis: 2250, // Moderator starts summarizing
  ctaReveal: 2460, // Call to action appears
} as const;

// ============================================================================
// BEAT MARKERS (optional - for syncing animations to music rhythm)
// Adjust these after listening to your track
// ============================================================================

export const BEATS = {
  // Example: beats every ~1 second during intro
  intro: [30, 60, 90, 120],
  // Example: faster beats during peak
  chatThread: [1812, 1830, 1848, 1866, 1884, 1902, 1920, 1938],
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get current scene based on frame
 */
export function getCurrentScene(frame: number): keyof typeof SCENES | null {
  for (const [name, scene] of Object.entries(SCENES)) {
    if (frame >= scene.start && frame < scene.end) {
      return name as keyof typeof SCENES;
    }
  }
  return null;
}

/**
 * Get energy level for current frame
 */
export function getEnergyLevel(frame: number): EnergyLevel {
  const scene = getCurrentScene(frame);
  return scene ? SCENE_ENERGY[scene] : 'medium';
}

/**
 * Get energy multiplier for animations (scale effects by energy)
 */
export function getEnergyMultiplier(frame: number): number {
  const energy = getEnergyLevel(frame);
  const multipliers: Record<EnergyLevel, number> = {
    low: 0.6,
    building: 0.8,
    medium: 1.0,
    high: 1.3,
    peak: 1.5,
    resolving: 0.9,
  };
  return multipliers[energy];
}

/**
 * Check if frame is near a transition
 */
export function isNearTransition(frame: number, tolerance: number = 15): boolean {
  return TRANSITION_FRAMES.some(t => Math.abs(frame - t) <= tolerance);
}

/**
 * Check if frame is on a beat (for animation sync)
 */
export function isOnBeat(frame: number, tolerance: number = 2): boolean {
  const allBeats = [...BEATS.intro, ...BEATS.chatThread];
  return allBeats.some(beat => Math.abs(frame - beat) <= tolerance);
}
