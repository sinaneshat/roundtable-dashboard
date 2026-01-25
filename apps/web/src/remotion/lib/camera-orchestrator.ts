/**
 * Camera Orchestrator
 *
 * Keyframe-based camera choreography system for cinematic scene transitions.
 * Interpolates between camera keyframes with configurable easing.
 */

import { Easing, interpolate, spring } from 'remotion';

import { CINEMATIC_SPRINGS } from './cinematic-springs';

/** Partial spring config for camera movements */
type PartialSpringConfig = {
  damping?: number;
  stiffness?: number;
  mass?: number;
};

// ============================================================================
// Types
// ============================================================================

/**
 * Full camera state at a given moment
 */
export type CameraState = {
  /** X position offset (-100 to 100) */
  x: number;
  /** Y position offset (-100 to 100) */
  y: number;
  /** Zoom/scale factor (0.5 to 2.0, 1.0 = normal) */
  z: number;
  /** Rotation around X axis (degrees) */
  rotateX: number;
  /** Rotation around Y axis (degrees) */
  rotateY: number;
  /** Rotation around Z axis (degrees) */
  rotateZ: number;
  /** Focus depth for depth-of-field (0 = in focus) */
  focusDepth: number;
  /** Aperture for DoF blur (lower = more blur, 1.4-16) */
  aperture: number;
};

/**
 * Camera keyframe with timing
 */
export type CameraKeyframe = {
  /** Frame number when this keyframe is reached */
  frame: number;
  /** Camera state at this keyframe */
  camera: Partial<CameraState>;
  /** Easing function for transition TO this keyframe */
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'spring';
  /** Spring config if easing is 'spring' */
  springConfig?: PartialSpringConfig;
  /** Duration of transition in frames (only for spring easing) */
  transitionDuration?: number;
};

/**
 * Camera orchestration configuration
 */
export type CameraOrchestrationConfig = {
  /** Keyframes defining camera path */
  keyframes: CameraKeyframe[];
  /** Default spring config for spring-based transitions */
  defaultSpringConfig?: PartialSpringConfig;
  /** Default transition duration */
  defaultTransitionDuration?: number;
  /** Enable subtle breathing motion */
  breathingEnabled?: boolean;
  /** Breathing motion intensity */
  breathingIntensity?: number;
  /** Breathing speed multiplier */
  breathingSpeed?: number;
};

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_CAMERA: CameraState = {
  x: 0,
  y: 0,
  z: 1,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
  focusDepth: 0,
  aperture: 2.8,
};

// ============================================================================
// Easing Functions
// ============================================================================

const EASING_FUNCTIONS = {
  linear: (t: number) => t,
  easeIn: Easing.in(Easing.quad),
  easeOut: Easing.out(Easing.quad),
  easeInOut: Easing.inOut(Easing.quad),
  // Spring is handled separately
  spring: (t: number) => t,
};

// ============================================================================
// Camera Interpolation
// ============================================================================

/**
 * Interpolate between two camera states
 */
function interpolateCameraState(
  from: CameraState,
  to: CameraState,
  progress: number,
): CameraState {
  return {
    x: interpolate(progress, [0, 1], [from.x, to.x]),
    y: interpolate(progress, [0, 1], [from.y, to.y]),
    z: interpolate(progress, [0, 1], [from.z, to.z]),
    rotateX: interpolate(progress, [0, 1], [from.rotateX, to.rotateX]),
    rotateY: interpolate(progress, [0, 1], [from.rotateY, to.rotateY]),
    rotateZ: interpolate(progress, [0, 1], [from.rotateZ, to.rotateZ]),
    focusDepth: interpolate(progress, [0, 1], [from.focusDepth, to.focusDepth]),
    aperture: interpolate(progress, [0, 1], [from.aperture, to.aperture]),
  };
}

/**
 * Get camera state at a specific frame
 */
export function getCameraAtFrame(
  frame: number,
  fps: number,
  keyframes: CameraKeyframe[],
  defaultSpringConfig: PartialSpringConfig = CINEMATIC_SPRINGS.cameraMain,
  defaultTransitionDuration: number = 30,
): CameraState {
  if (keyframes.length === 0) {
    return DEFAULT_CAMERA;
  }

  // Sort keyframes by frame number
  const sortedKeyframes = [...keyframes].sort((a, b) => a.frame - b.frame);

  // Find current segment (between which two keyframes we are)
  let fromIdx = 0;
  for (let i = sortedKeyframes.length - 1; i >= 0; i--) {
    const kf = sortedKeyframes[i];
    if (kf && frame >= kf.frame) {
      fromIdx = i;
      break;
    }
  }

  const toIdx = Math.min(fromIdx + 1, sortedKeyframes.length - 1);
  const fromKeyframe = sortedKeyframes[fromIdx];
  const toKeyframe = sortedKeyframes[toIdx];

  if (!fromKeyframe || !toKeyframe) {
    return DEFAULT_CAMERA;
  }

  // If at or past the last keyframe, return its state
  if (fromIdx === toIdx || frame >= toKeyframe.frame) {
    return { ...DEFAULT_CAMERA, ...fromKeyframe.camera };
  }

  // Calculate progress between keyframes
  const fromFrame = fromKeyframe.frame;
  const toFrame = toKeyframe.frame;
  const segmentDuration = toFrame - fromFrame;
  const elapsedInSegment = frame - fromFrame;

  // Get easing and calculate progress
  const easing = toKeyframe.easing ?? 'easeInOut';
  const transitionDuration = toKeyframe.transitionDuration ?? defaultTransitionDuration;

  let progress: number;

  if (easing === 'spring') {
    const springConfig = toKeyframe.springConfig ?? defaultSpringConfig;
    progress = spring({
      frame: elapsedInSegment,
      fps,
      config: springConfig,
      durationInFrames: Math.min(transitionDuration, segmentDuration),
    });
  } else {
    const easingFn = EASING_FUNCTIONS[easing];
    const linearProgress = Math.min(elapsedInSegment / segmentDuration, 1);
    progress = easingFn(linearProgress);
  }

  // Merge with defaults and interpolate
  const fromState: CameraState = { ...DEFAULT_CAMERA, ...fromKeyframe.camera };
  const toState: CameraState = { ...DEFAULT_CAMERA, ...toKeyframe.camera };

  return interpolateCameraState(fromState, toState, progress);
}

/**
 * Add breathing motion to camera state
 */
export function addBreathingMotion(
  camera: CameraState,
  frame: number,
  intensity: number = 3,
  speed: number = 0.008,
): CameraState {
  const breathX = Math.sin(frame * speed) * intensity;
  const breathY = Math.cos(frame * speed * 0.7) * intensity * 0.6;

  return {
    ...camera,
    x: camera.x + breathX,
    y: camera.y + breathY,
  };
}

// ============================================================================
// Depth of Field
// ============================================================================

/**
 * Calculate blur amount based on distance from focus plane
 *
 * @param elementDepth - Depth of the element (0 = focus plane)
 * @param aperture - Camera aperture (lower = more blur)
 * @param maxBlur - Maximum blur in pixels
 */
export function depthOfFieldBlur(
  elementDepth: number,
  aperture: number = 2.8,
  maxBlur: number = 30,
): number {
  // Circle of confusion based on aperture
  // Lower aperture = larger CoC = more blur
  const coc = Math.abs(elementDepth) * (10 / aperture);
  return Math.min(coc, maxBlur);
}

/**
 * Get blur for an element at a specific depth
 */
export function getDepthBlur(
  elementDepth: number,
  cameraFocusDepth: number,
  aperture: number = 2.8,
): number {
  const distance = elementDepth - cameraFocusDepth;
  return depthOfFieldBlur(distance, aperture);
}

// ============================================================================
// Transform Generation
// ============================================================================

/**
 * Convert camera state to CSS transform string
 */
export function cameraStateToTransform(camera: CameraState): string {
  return `
    translateX(${camera.x}px)
    translateY(${camera.y}px)
    scale(${camera.z})
    rotateX(${camera.rotateX}deg)
    rotateY(${camera.rotateY}deg)
    rotateZ(${camera.rotateZ}deg)
  `.replace(/\s+/g, ' ').trim();
}

/**
 * Get perspective value based on camera state
 * Closer zoom = larger perspective for more dramatic effect
 */
export function getCameraPerspective(camera: CameraState, basePerspective: number = 1200): number {
  // Scale perspective with zoom - closer = more dramatic perspective
  return basePerspective / camera.z;
}

// ============================================================================
// Orchestrator Class
// ============================================================================

/**
 * Camera orchestrator for managing scene-wide camera choreography
 */
export class CameraOrchestrator {
  private keyframes: CameraKeyframe[];
  private defaultSpringConfig: PartialSpringConfig;
  private defaultTransitionDuration: number;
  private breathingEnabled: boolean;
  private breathingIntensity: number;
  private breathingSpeed: number;

  constructor(config: CameraOrchestrationConfig) {
    this.keyframes = config.keyframes;
    this.defaultSpringConfig = config.defaultSpringConfig ?? CINEMATIC_SPRINGS.cameraMain;
    this.defaultTransitionDuration = config.defaultTransitionDuration ?? 30;
    this.breathingEnabled = config.breathingEnabled ?? true;
    this.breathingIntensity = config.breathingIntensity ?? 3;
    this.breathingSpeed = config.breathingSpeed ?? 0.008;
  }

  /**
   * Get camera state at frame
   */
  getCamera(frame: number, fps: number): CameraState {
    let camera = getCameraAtFrame(
      frame,
      fps,
      this.keyframes,
      this.defaultSpringConfig,
      this.defaultTransitionDuration,
    );

    if (this.breathingEnabled) {
      camera = addBreathingMotion(
        camera,
        frame,
        this.breathingIntensity,
        this.breathingSpeed,
      );
    }

    return camera;
  }

  /**
   * Get CSS transform string at frame
   */
  getTransform(frame: number, fps: number): string {
    return cameraStateToTransform(this.getCamera(frame, fps));
  }

  /**
   * Get perspective value at frame
   */
  getPerspective(frame: number, fps: number, basePerspective: number = 1200): number {
    return getCameraPerspective(this.getCamera(frame, fps), basePerspective);
  }

  /**
   * Add a keyframe dynamically
   */
  addKeyframe(keyframe: CameraKeyframe): void {
    this.keyframes.push(keyframe);
    this.keyframes.sort((a, b) => a.frame - b.frame);
  }
}
