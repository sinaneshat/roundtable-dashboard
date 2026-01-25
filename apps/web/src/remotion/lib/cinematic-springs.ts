/**
 * Cinematic Spring Configurations
 *
 * Film-quality spring physics for professional camera movements.
 * These are tuned for smooth, organic motion that mimics real camera work.
 */

import type { SpringConfig } from 'remotion';

/**
 * Film-quality spring configurations for cinematic effects
 *
 * Each config is tuned for specific motion characteristics:
 * - Higher damping = smoother, less overshoot
 * - Higher stiffness = snappier response
 * - Higher mass = more inertia, slower to start/stop
 */
export const CINEMATIC_SPRINGS = {
  /**
   * Main camera movements - smooth, professional dolly/track motion
   * Used for: scene-wide camera movements, panning, tracking shots
   */
  cameraMain: { damping: 60, stiffness: 70, mass: 1.4 } satisfies Partial<SpringConfig>,

  /**
   * Dramatic reveals - slower, more theatrical motion
   * Used for: logo reveals, important UI element entrances
   */
  reveal: { damping: 80, stiffness: 50, mass: 1.6 } satisfies Partial<SpringConfig>,

  /**
   * Crisp UI entrance - snappy without being jarring
   * Used for: buttons, modals, dropdown entrances
   */
  uiEntrance: { damping: 28, stiffness: 180, mass: 0.7 } satisfies Partial<SpringConfig>,

  /**
   * Focus transitions - medium speed for focus pulls
   * Used for: depth of field changes, attention shifts
   */
  focusPull: { damping: 45, stiffness: 90, mass: 1.1 } satisfies Partial<SpringConfig>,

  /**
   * Impact moment - THE DROP, maximum energy
   * Used for: peak moments, chat thread entrance, key reveals
   */
  impactMoment: { damping: 20, stiffness: 200, mass: 0.8 } satisfies Partial<SpringConfig>,

  /**
   * Subtle breathing motion - gentle constant motion
   * Used for: ambient movement, floating effects
   */
  breathing: { damping: 100, stiffness: 30, mass: 2.0 } satisfies Partial<SpringConfig>,

  /**
   * Quick settle - fast response with minimal overshoot
   * Used for: quick corrections, snap-to positions
   */
  quickSettle: { damping: 35, stiffness: 250, mass: 0.6 } satisfies Partial<SpringConfig>,

  /**
   * Heavy momentum - slow start, smooth deceleration
   * Used for: heavy elements, dramatic weight
   */
  heavyMomentum: { damping: 50, stiffness: 40, mass: 2.5 } satisfies Partial<SpringConfig>,
} as const;

/**
 * Transition-specific spring configurations
 * Matched to transition types for consistent motion language
 */
export const TRANSITION_SPRINGS = {
  /** depthZoom transition */
  depthZoom: { damping: 55, stiffness: 65, mass: 1.3 } satisfies Partial<SpringConfig>,

  /** cameraOrbit transition */
  cameraOrbit: { damping: 65, stiffness: 55, mass: 1.5 } satisfies Partial<SpringConfig>,

  /** zoomThrough transition - faster, more energetic */
  zoomThrough: { damping: 40, stiffness: 120, mass: 1.0 } satisfies Partial<SpringConfig>,

  /** parallaxPush transition - dramatic depth movement */
  parallaxPush: { damping: 35, stiffness: 100, mass: 1.2 } satisfies Partial<SpringConfig>,

  /** chromaticZoom transition - quick, punchy */
  chromaticZoom: { damping: 25, stiffness: 180, mass: 0.9 } satisfies Partial<SpringConfig>,

  /** depthFade transition - soft, subtle */
  depthFade: { damping: 70, stiffness: 45, mass: 1.4 } satisfies Partial<SpringConfig>,
} as const;

/**
 * Scene-specific camera spring configurations
 * Each scene may need different motion characteristics
 */
export const SCENE_CAMERA_SPRINGS = {
  /** Scene01Intro - dramatic reveal */
  intro: CINEMATIC_SPRINGS.reveal,

  /** Scene02Homepage - smooth exploration */
  homepage: CINEMATIC_SPRINGS.cameraMain,

  /** Scene03Sidebar - quick, UI-focused */
  sidebar: CINEMATIC_SPRINGS.uiEntrance,

  /** SceneChatInput - varied, follows phases */
  chatInput: CINEMATIC_SPRINGS.cameraMain,

  /** SceneModelModal - focus on details */
  modelModal: CINEMATIC_SPRINGS.focusPull,

  /** SceneChatThread - THE DROP! High energy */
  chatThread: CINEMATIC_SPRINGS.impactMoment,

  /** Scene17Finale - smooth, conclusive */
  finale: CINEMATIC_SPRINGS.cameraMain,
} as const;

export type CinematicSpringName = keyof typeof CINEMATIC_SPRINGS;
export type TransitionSpringName = keyof typeof TRANSITION_SPRINGS;
export type SceneCameraSpringName = keyof typeof SCENE_CAMERA_SPRINGS;
