/**
 * Remotion Components
 * Re-exports all reusable video composition components
 */

export { BrowserFrame } from './BrowserFrame';
export { BrowserFrame3D, CAMERA_PRESETS, type CameraPreset, getPresetRotation } from './BrowserFrame3D';
export { CameraFlythrough, FLYTHROUGH_PRESETS, type FlythroughPreset } from './CameraFlythrough';
export { ChromaticAberration } from './ChromaticAberration';
export {
  CascadeStack,
  type FloatingStackPreset,
  type FloatingWindow,
  FloatingWindowStack,
  type FloatingWindowStackProps,
  HeroContextStack,
  SpreadStack,
} from './FloatingWindowStack';
export * from './scene-primitives';
export * from './ui-replicas';
export * from './video-primitives';
export { VideoProgressIndicator } from './VideoProgressIndicator';
