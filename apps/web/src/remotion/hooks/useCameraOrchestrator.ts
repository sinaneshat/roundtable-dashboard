/**
 * Camera Orchestrator Hook
 *
 * React hook for cinematic camera choreography using keyframe-based animation.
 */

import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import type { SpringConfig } from 'remotion';
import { useCurrentFrame, useVideoConfig } from 'remotion';

import type { CameraKeyframe, CameraState } from '../lib/camera-orchestrator';
import {
  addBreathingMotion,
  CameraOrchestrator,
  cameraStateToTransform,
  getCameraAtFrame,
  getCameraPerspective,
  getDepthBlur,
} from '../lib/camera-orchestrator';
import { CINEMATIC_SPRINGS } from '../lib/cinematic-springs';

/** Partial spring config type */
type PartialSpringConfig = Partial<SpringConfig>;

// ============================================================================
// Types
// ============================================================================

export type UseCameraOrchestratorConfig = {
  /** Camera keyframes defining the path */
  keyframes: CameraKeyframe[];
  /** Default spring config for transitions */
  springConfig?: PartialSpringConfig;
  /** Default transition duration in frames */
  transitionDuration?: number;
  /** Enable subtle breathing motion */
  breathing?: boolean;
  /** Breathing intensity */
  breathingIntensity?: number;
  /** Breathing speed */
  breathingSpeed?: number;
  /** Base perspective value */
  basePerspective?: number;
};

export type CameraOrchestratorResult = {
  /** Current camera state */
  camera: CameraState;
  /** CSS transform string */
  transform: string;
  /** CSS perspective value */
  perspective: number;
  /** Full style object for container */
  containerStyle: CSSProperties;
  /** Style for perspective wrapper */
  perspectiveStyle: CSSProperties;
  /** Get blur for element at depth */
  getBlurAtDepth: (depth: number) => number;
};

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for orchestrating camera movements with keyframes
 *
 * @example
 * const { containerStyle, perspectiveStyle } = useCameraOrchestrator({
 *   keyframes: [
 *     { frame: 0, camera: { z: 0.85, rotateX: -8, y: 30 } },
 *     { frame: 45, camera: { z: 1.0 }, easing: 'spring' },
 *     { frame: 90, camera: { x: -15, z: 1.02, rotateY: -2 } },
 *   ],
 * });
 *
 * return (
 *   <div style={perspectiveStyle}>
 *     <div style={containerStyle}>
 *       {content}
 *     </div>
 *   </div>
 * );
 */
export function useCameraOrchestrator(config: UseCameraOrchestratorConfig): CameraOrchestratorResult {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const {
    keyframes,
    springConfig = CINEMATIC_SPRINGS.cameraMain,
    transitionDuration = 30,
    breathing = true,
    breathingIntensity = 3,
    breathingSpeed = 0.008,
    basePerspective = 1200,
  } = config;

  // Calculate camera state
  const baseCamera = useMemo(() => {
    return getCameraAtFrame(
      frame,
      fps,
      keyframes,
      springConfig,
      transitionDuration,
    );
  }, [frame, fps, keyframes, springConfig, transitionDuration]);

  // Add breathing motion
  const camera = useMemo(() => {
    if (!breathing) {
      return baseCamera;
    }
    return addBreathingMotion(baseCamera, frame, breathingIntensity, breathingSpeed);
  }, [baseCamera, breathing, frame, breathingIntensity, breathingSpeed]);

  // Calculate transform and perspective
  const transform = useMemo(() => cameraStateToTransform(camera), [camera]);
  const perspective = useMemo(() => getCameraPerspective(camera, basePerspective), [camera, basePerspective]);

  // Blur helper
  const getBlurAtDepth = useMemo(() => {
    return (depth: number) => getDepthBlur(depth, camera.focusDepth, camera.aperture);
  }, [camera.focusDepth, camera.aperture]);

  // Style objects
  const perspectiveStyle: CSSProperties = useMemo(() => ({
    perspective: `${perspective}px`,
    perspectiveOrigin: '50% 50%',
    transformStyle: 'preserve-3d',
  }), [perspective]);

  const containerStyle: CSSProperties = useMemo(() => ({
    transform,
    transformStyle: 'preserve-3d',
    backfaceVisibility: 'hidden',
    willChange: 'transform',
  }), [transform]);

  return {
    camera,
    transform,
    perspective,
    containerStyle,
    perspectiveStyle,
    getBlurAtDepth,
  };
}

// ============================================================================
// Simple Camera Hooks
// ============================================================================

/**
 * Simple hook for a single camera movement
 */
export function useCameraMovement(
  from: Partial<CameraState>,
  to: Partial<CameraState>,
  startFrame = 0,
  duration = 60,
  springConfig: PartialSpringConfig = CINEMATIC_SPRINGS.cameraMain,
): CameraOrchestratorResult {
  return useCameraOrchestrator({
    keyframes: [
      { frame: startFrame, camera: from },
      { frame: startFrame + duration, camera: to, easing: 'spring', springConfig },
    ],
    springConfig,
  });
}

/**
 * Hook for dramatic entrance animation
 */
export function useDramaticEntrance(
  entranceDuration = 45,
  settleDuration = 30,
): CameraOrchestratorResult {
  return useCameraOrchestrator({
    keyframes: [
      { frame: 0, camera: { z: 0.85, rotateX: -8, y: 30 } },
      { frame: entranceDuration, camera: { z: 1.0 }, easing: 'spring', springConfig: CINEMATIC_SPRINGS.reveal },
      { frame: entranceDuration + settleDuration, camera: { x: 0, y: 0, z: 1.0 }, easing: 'spring' },
    ],
    springConfig: CINEMATIC_SPRINGS.reveal,
  });
}

/**
 * Hook for orbit/drift camera movement
 */
export function useOrbitCamera(
  amplitude: { x: number; y: number; rotateY: number } = { x: 30, y: 10, rotateY: 3 },
  duration = 150,
): CameraOrchestratorResult {
  return useCameraOrchestrator({
    keyframes: [
      { frame: 0, camera: { x: amplitude.x, y: -amplitude.y, rotateY: -amplitude.rotateY } },
      { frame: duration * 0.5, camera: { x: -amplitude.x, y: amplitude.y, rotateY: amplitude.rotateY }, easing: 'easeInOut' },
      { frame: duration, camera: { x: amplitude.x, y: -amplitude.y, rotateY: -amplitude.rotateY }, easing: 'easeInOut' },
    ],
  });
}

// ============================================================================
// Class-based Orchestrator (for complex scenes)
// ============================================================================

/**
 * Create a camera orchestrator instance for more complex control
 */
export function createCameraOrchestrator(config: UseCameraOrchestratorConfig): CameraOrchestrator {
  return new CameraOrchestrator({
    keyframes: config.keyframes,
    defaultSpringConfig: config.springConfig,
    defaultTransitionDuration: config.transitionDuration,
    breathingEnabled: config.breathing,
    breathingIntensity: config.breathingIntensity,
    breathingSpeed: config.breathingSpeed,
  });
}
