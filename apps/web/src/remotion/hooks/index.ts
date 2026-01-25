/**
 * Remotion Hooks Index
 */

// 3D Camera hooks
export type {
  CameraOrbitConfig,
  CameraOrbitResult,
  Entrance3DConfig,
  Entrance3DResult,
  ParallaxLayersResult,
  Perspective3DConfig,
  Perspective3DResult,
} from './use3DCamera';
export {
  use3DEntrance,
  use3DPerspective,
  useCameraOrbit,
  useDepthBlur,
  useParallaxLayers,
} from './use3DCamera';

// Advanced depth layer hooks
export type {
  UseDepthLayerConfig,
  UseDepthLayersConfig,
  UseParallaxPushConfig,
  UseRackFocusConfig,
} from './useAdvancedDepthLayer';
export {
  getLayerOrder,
  useDepthLayer,
  useDepthLayers,
  useLayerConfig,
  useLayerDepth,
  useParallaxPush,
  useRackFocus,
} from './useAdvancedDepthLayer';

// Camera hooks
export { useCamera, usePanLeft, usePanRight, useZoomIn, useZoomOut } from './useCamera';

// Camera orchestrator hooks
export type { CameraOrchestratorResult, UseCameraOrchestratorConfig } from './useCameraOrchestrator';
export {
  createCameraOrchestrator,
  useCameraMovement,
  useCameraOrchestrator,
  useDramaticEntrance,
  useOrbitCamera,
} from './useCameraOrchestrator';

// Cinematic camera hooks
export type { CameraMovement, CinematicCameraConfig, DepthParallaxConfig } from './useCinematicCamera';
export {
  useCameraPan,
  useCinematicCamera,
  useDepthParallax,
  useFocusPull,
  useSceneEntrance,
  useZoomFocus,
} from './useCinematicCamera';

// Focus transition hooks
export { createFocusTransition } from './useFocusTransition';
