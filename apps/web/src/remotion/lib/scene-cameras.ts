/**
 * Scene Camera Configurations
 *
 * Per-scene camera keyframe configurations for cinematic choreography.
 * Each scene has tailored camera movements that enhance the content.
 */

import type { CameraKeyframe } from './camera-orchestrator';
import { CINEMATIC_SPRINGS } from './cinematic-springs';

// ============================================================================
// Scene01Intro Camera (150 frames)
// ============================================================================

/**
 * Intro scene camera - dramatic logo reveal
 *
 * | Frame | Camera | Effect |
 * |-------|--------|--------|
 * | 0 | z:0.85, rotateX:-8, y:30 | Pulled back, tilted up |
 * | 45 | z:1.0, level | Push in, logo focus |
 * | 90 | x:-15, z:1.02, rotateY:-2 | Drift right |
 * | 140 | z:0.95, rotateX:2 | Pull back for exit |
 */
export const SCENE01_INTRO_CAMERA: CameraKeyframe[] = [
  {
    frame: 0,
    camera: {
      z: 0.85,
      rotateX: -8,
      y: 30,
      aperture: 2.0,
    },
  },
  {
    frame: 45,
    camera: {
      z: 1.0,
      rotateX: 0,
      y: 0,
      aperture: 2.8,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.reveal,
    transitionDuration: 40,
  },
  {
    frame: 90,
    camera: {
      x: -15,
      z: 1.02,
      rotateY: -2,
    },
    easing: 'easeInOut',
  },
  {
    frame: 140,
    camera: {
      z: 0.95,
      rotateX: 2,
      x: 0,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.cameraMain,
  },
];

// ============================================================================
// Scene02Homepage Camera (150 frames)
// ============================================================================

/**
 * Homepage scene camera - smooth exploration
 *
 * | Frame | Camera | Effect |
 * |-------|--------|--------|
 * | 0 | x:60, z:0.9, rotateY:3 | Enter from left |
 * | 75 | z:1.05, rotateZ:-1 | Mid-scene dolly |
 * | 120 | x:-50, z:1.08 | Continue dolly |
 */
export const SCENE02_HOMEPAGE_CAMERA: CameraKeyframe[] = [
  {
    frame: 0,
    camera: {
      x: 60,
      z: 0.9,
      rotateY: 3,
    },
  },
  {
    frame: 75,
    camera: {
      x: 0,
      z: 1.05,
      rotateZ: -1,
      rotateY: 0,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.cameraMain,
    transitionDuration: 50,
  },
  {
    frame: 120,
    camera: {
      x: -50,
      z: 1.08,
      rotateZ: 0,
    },
    easing: 'easeInOut',
  },
];

// ============================================================================
// Scene03Sidebar Camera (120 frames)
// ============================================================================

/**
 * Sidebar scene camera - UI-focused movements
 *
 * | Frame | Camera | Effect |
 * |-------|--------|--------|
 * | 0 | x:-100, rotateY:5 | Wide view |
 * | 60 | z:1.1, rotateX:-2 | Closer on content |
 */
export const SCENE03_SIDEBAR_CAMERA: CameraKeyframe[] = [
  {
    frame: 0,
    camera: {
      x: -100,
      rotateY: 5,
      z: 0.95,
    },
  },
  {
    frame: 60,
    camera: {
      x: 0,
      z: 1.1,
      rotateX: -2,
      rotateY: 0,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.uiEntrance,
    transitionDuration: 40,
  },
  {
    frame: 110,
    camera: {
      z: 1.05,
      rotateX: 0,
    },
    easing: 'easeOut',
  },
];

// ============================================================================
// SceneChatInput Camera (1080 frames - 8 phases)
// ============================================================================

/**
 * Chat input scene camera - phase-based reframes
 *
 * Key moments:
 * - Frame 90: Initial typing
 * - Frame 270: Auto mode switch - slight zoom
 * - Frame 420: Models section
 * - Frame 510: Files attachment
 * - Frame 660: Voice recording - focus on mic
 * - Frame 840: Typing continuation
 * - Frame 990: Send button - dramatic zoom
 */
export const SCENE_CHAT_INPUT_CAMERA: CameraKeyframe[] = [
  {
    frame: 0,
    camera: {
      z: 0.95,
      y: 10,
    },
  },
  {
    frame: 90,
    camera: {
      z: 1.02,
      y: 0,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.cameraMain,
  },
  {
    frame: 270,
    camera: {
      z: 1.08,
      x: -20,
      rotateY: -2,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.focusPull,
    transitionDuration: 40,
  },
  {
    frame: 420,
    camera: {
      z: 1.05,
      x: 0,
      rotateY: 0,
    },
    easing: 'easeInOut',
  },
  {
    frame: 510,
    camera: {
      z: 1.06,
      y: -10,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.uiEntrance,
  },
  {
    frame: 660,
    camera: {
      x: -25,
      z: 1.1,
      rotateY: -1,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.focusPull,
    transitionDuration: 35,
  },
  {
    frame: 840,
    camera: {
      x: 0,
      z: 1.05,
      rotateY: 0,
    },
    easing: 'easeInOut',
  },
  {
    frame: 990,
    camera: {
      z: 1.15,
      y: -15,
      rotateX: 2,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.impactMoment,
    transitionDuration: 30,
  },
  {
    frame: 1050,
    camera: {
      z: 1.08,
      y: 0,
      rotateX: 0,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.cameraMain,
  },
];

// ============================================================================
// SceneModelModal Camera (390 frames)
// ============================================================================

/**
 * Model modal scene camera - tab-focused movements
 *
 * | Frame | Camera | Effect |
 * |-------|--------|--------|
 * | 0 | z:0.8, rotateX:-3 | Enter from behind |
 * | 120 | y:-20, z:1.08 | Focus on tabs |
 * | 300 | z:1.1 | Drag reorder view |
 */
export const SCENE_MODEL_MODAL_CAMERA: CameraKeyframe[] = [
  {
    frame: 0,
    camera: {
      z: 0.8,
      rotateX: -3,
      y: 30,
    },
  },
  {
    frame: 60,
    camera: {
      z: 1.0,
      rotateX: 0,
      y: 0,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.reveal,
    transitionDuration: 45,
  },
  {
    frame: 120,
    camera: {
      y: -20,
      z: 1.08,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.focusPull,
  },
  {
    frame: 240,
    camera: {
      z: 1.05,
      y: -10,
    },
    easing: 'easeInOut',
  },
  {
    frame: 300,
    camera: {
      z: 1.1,
      y: -15,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.uiEntrance,
  },
  {
    frame: 360,
    camera: {
      z: 1.02,
      y: 0,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.cameraMain,
  },
];

// ============================================================================
// SceneChatThread Camera (630 frames) - PEAK ENERGY
// ============================================================================

/**
 * Chat thread scene camera - THE DROP entrance + conversation follow
 *
 * | Frame | Camera | Effect |
 * |-------|--------|--------|
 * | 0 | y:50, z:0.85, rotateX:-6, rotateZ:2 | THE DROP entrance |
 * | 45 | level | Settle |
 * | 240 | z:0.95 | Wide for all models |
 * | 480 | y:-100, z:1.08 | Moderator synthesis |
 */
export const SCENE_CHAT_THREAD_CAMERA: CameraKeyframe[] = [
  {
    frame: 0,
    camera: {
      y: 50,
      z: 0.85,
      rotateX: -6,
      rotateZ: 2,
      aperture: 1.8, // Shallow depth for impact
    },
  },
  {
    frame: 45,
    camera: {
      y: 0,
      z: 1.0,
      rotateX: 0,
      rotateZ: 0,
      aperture: 2.8,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.impactMoment,
    transitionDuration: 35,
  },
  {
    frame: 120,
    camera: {
      z: 1.02,
      x: -15,
      rotateY: -1,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.cameraMain,
  },
  {
    frame: 240,
    camera: {
      z: 0.95,
      x: 0,
      rotateY: 0,
    },
    easing: 'easeInOut',
  },
  {
    frame: 340,
    camera: {
      z: 1.0,
      y: -30,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.cameraMain,
  },
  {
    frame: 450,
    camera: {
      z: 1.05,
      y: -80,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.focusPull,
  },
  {
    frame: 540,
    camera: {
      y: -100,
      z: 1.08,
      rotateX: -2,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.focusPull,
    transitionDuration: 40,
  },
  {
    frame: 600,
    camera: {
      z: 1.05,
      rotateX: 0,
    },
    easing: 'easeOut',
  },
];

// ============================================================================
// Scene17Finale Camera (150 frames)
// ============================================================================

/**
 * Finale scene camera - CTA focus
 *
 * | Frame | Camera | Effect |
 * |-------|--------|--------|
 * | 0 | z:0.9 | Start slightly back |
 * | 60 | y:-10, z:1.05 | CTA reveal |
 * | 100 | y:-15, z:1.08 | Hold on CTA |
 */
export const SCENE17_FINALE_CAMERA: CameraKeyframe[] = [
  {
    frame: 0,
    camera: {
      z: 0.9,
      y: 20,
    },
  },
  {
    frame: 45,
    camera: {
      z: 1.0,
      y: 0,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.reveal,
    transitionDuration: 35,
  },
  {
    frame: 60,
    camera: {
      y: -10,
      z: 1.05,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.cameraMain,
  },
  {
    frame: 100,
    camera: {
      y: -15,
      z: 1.08,
    },
    easing: 'spring',
    springConfig: CINEMATIC_SPRINGS.focusPull,
  },
  {
    frame: 140,
    camera: {
      z: 1.05,
      y: -10,
    },
    easing: 'easeOut',
  },
];

// ============================================================================
// Scene Camera Registry
// ============================================================================

export const SCENE_CAMERAS = {
  intro: SCENE01_INTRO_CAMERA,
  homepage: SCENE02_HOMEPAGE_CAMERA,
  sidebar: SCENE03_SIDEBAR_CAMERA,
  chatInput: SCENE_CHAT_INPUT_CAMERA,
  modelModal: SCENE_MODEL_MODAL_CAMERA,
  chatThread: SCENE_CHAT_THREAD_CAMERA,
  finale: SCENE17_FINALE_CAMERA,
} as const;

export type SceneCameraName = keyof typeof SCENE_CAMERAS;

/**
 * Get camera keyframes for a scene
 */
export function getSceneCamera(scene: SceneCameraName): CameraKeyframe[] {
  return SCENE_CAMERAS[scene];
}
