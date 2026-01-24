/**
 * Cinematic Camera Hooks for Remotion
 *
 * Provides reusable camera movement patterns with spring physics,
 * parallax depth effects, and smooth transitions.
 */

import type { CSSProperties } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import type { CameraPosition, SpringConfig } from '../lib/camera-3d';
import { CAMERA_SPRINGS, cameraToTransform, DEFAULT_CAMERA, getCameraPosition } from '../lib/camera-3d';

// ============================================================================
// Types
// ============================================================================

export type CameraMovement = 'static' | 'dolly-right' | 'dolly-left' | 'truck-up' | 'truck-down' | 'zoom-in' | 'zoom-out' | 'orbit' | 'reveal' | 'dramatic-zoom';

export type CinematicCameraConfig = {
  movement?: CameraMovement;
  startFrame?: number;
  duration?: number;
  intensity?: number;
  springConfig?: SpringConfig;
  orbitSpeed?: number;
  breathingEnabled?: boolean;
  breathingIntensity?: number;
};

export type DepthParallaxConfig = {
  layer: 'far' | 'mid' | 'near' | 'focus';
  cameraX?: number;
  cameraY?: number;
};

// ============================================================================
// Movement Presets
// ============================================================================

const MOVEMENT_PRESETS: Record<CameraMovement, { from: CameraPosition; to: CameraPosition }> = {
  'static': { from: DEFAULT_CAMERA, to: DEFAULT_CAMERA },
  'dolly-right': {
    from: { ...DEFAULT_CAMERA, x: 50 },
    to: { ...DEFAULT_CAMERA, x: -50 },
  },
  'dolly-left': {
    from: { ...DEFAULT_CAMERA, x: -50 },
    to: { ...DEFAULT_CAMERA, x: 50 },
  },
  'truck-up': {
    from: { ...DEFAULT_CAMERA, y: 30 },
    to: { ...DEFAULT_CAMERA, y: -30 },
  },
  'truck-down': {
    from: { ...DEFAULT_CAMERA, y: -30 },
    to: { ...DEFAULT_CAMERA, y: 30 },
  },
  'zoom-in': {
    from: { ...DEFAULT_CAMERA, z: 0.9 },
    to: { ...DEFAULT_CAMERA, z: 1.1 },
  },
  'zoom-out': {
    from: { ...DEFAULT_CAMERA, z: 1.1 },
    to: { ...DEFAULT_CAMERA, z: 0.95 },
  },
  'orbit': {
    from: { ...DEFAULT_CAMERA, rotateY: -3 },
    to: { ...DEFAULT_CAMERA, rotateY: 3 },
  },
  'reveal': {
    from: { ...DEFAULT_CAMERA, z: 1.3, y: 20 },
    to: DEFAULT_CAMERA,
  },
  'dramatic-zoom': {
    from: { ...DEFAULT_CAMERA, z: 0.8, rotateX: 5 },
    to: { ...DEFAULT_CAMERA, z: 1.05, rotateX: 0 },
  },
};

// ============================================================================
// Parallax Multipliers
// ============================================================================

const PARALLAX_MULTIPLIERS: Record<DepthParallaxConfig['layer'], number> = {
  far: 0.2,
  mid: 0.5,
  near: 0.8,
  focus: 1.0,
};

const DEPTH_BLUR: Record<DepthParallaxConfig['layer'], number> = {
  far: 15,
  mid: 6,
  near: 2,
  focus: 0,
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * Main cinematic camera hook
 * Returns transform string and opacity for scene container
 */
export function useCinematicCamera(config: CinematicCameraConfig = {}): {
  transform: string;
  camera: CameraPosition;
  breathingOffset: { x: number; y: number };
} {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const {
    movement = 'static',
    startFrame = 0,
    duration = 60,
    intensity = 1,
    springConfig = CAMERA_SPRINGS.cinematic,
    orbitSpeed = 0.008,
    breathingEnabled = true,
    breathingIntensity = 3,
  } = config;

  // Get movement preset
  const preset = MOVEMENT_PRESETS[movement];

  // Apply intensity scaling
  const scaledFrom: CameraPosition = {
    x: preset.from.x * intensity,
    y: preset.from.y * intensity,
    z: 1 + (preset.from.z - 1) * intensity,
    rotateX: preset.from.rotateX * intensity,
    rotateY: preset.from.rotateY * intensity,
    rotateZ: preset.from.rotateZ * intensity,
  };

  const scaledTo: CameraPosition = {
    x: preset.to.x * intensity,
    y: preset.to.y * intensity,
    z: 1 + (preset.to.z - 1) * intensity,
    rotateX: preset.to.rotateX * intensity,
    rotateY: preset.to.rotateY * intensity,
    rotateZ: preset.to.rotateZ * intensity,
  };

  // Calculate camera position
  const camera = getCameraPosition(
    frame,
    fps,
    scaledFrom,
    scaledTo,
    startFrame,
    duration,
    springConfig,
  );

  // Add subtle breathing/floating motion
  const breathingOffset = breathingEnabled
    ? {
        x: Math.sin(frame * orbitSpeed) * breathingIntensity,
        y: Math.cos(frame * orbitSpeed * 0.7) * breathingIntensity * 0.6,
      }
    : { x: 0, y: 0 };

  // Combine camera position with breathing
  const finalCamera: CameraPosition = {
    ...camera,
    x: camera.x + breathingOffset.x,
    y: camera.y + breathingOffset.y,
  };

  return {
    transform: cameraToTransform(finalCamera),
    camera: finalCamera,
    breathingOffset,
  };
}

/**
 * Depth parallax hook for layered elements
 */
export function useDepthParallax(config: DepthParallaxConfig): {
  transform: string;
  filter: string;
  opacity: number;
  style: CSSProperties;
} {
  const frame = useCurrentFrame();
  const { layer, cameraX = 0, cameraY = 0 } = config;

  const multiplier = PARALLAX_MULTIPLIERS[layer];
  const blur = DEPTH_BLUR[layer];

  // Parallax offset based on camera position
  const parallaxX = cameraX * multiplier;
  const parallaxY = cameraY * multiplier;

  // Subtle floating motion per layer
  const floatX = Math.sin(frame * 0.01 * (1 / multiplier)) * 3 * multiplier;
  const floatY = Math.cos(frame * 0.008 * (1 / multiplier)) * 2 * multiplier;

  // Opacity based on depth
  const opacity = layer === 'focus' ? 1 : 0.3 + multiplier * 0.6;

  return {
    transform: `translate(${parallaxX + floatX}px, ${parallaxY + floatY}px)`,
    filter: blur > 0 ? `blur(${blur}px)` : 'none',
    opacity,
    style: {
      transform: `translate(${parallaxX + floatX}px, ${parallaxY + floatY}px)`,
      filter: blur > 0 ? `blur(${blur}px)` : undefined,
      opacity,
    },
  };
}

/**
 * Scene entrance animation hook
 */
export function useSceneEntrance(config: {
  delay?: number;
  duration?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'scale';
  springConfig?: SpringConfig;
} = {}): {
  opacity: number;
  transform: string;
  style: CSSProperties;
  progress: number;
} {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const {
    delay = 0,
    duration = 25,
    direction = 'up',
    springConfig = { damping: 40, stiffness: 100, mass: 1.2 },
  } = config;

  const progress = spring({
    frame: frame - delay,
    fps,
    config: springConfig,
    durationInFrames: duration,
  });

  const opacity = interpolate(progress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  let transform = '';
  switch (direction) {
    case 'up':
      transform = `translateY(${interpolate(progress, [0, 1], [30, 0])}px)`;
      break;
    case 'down':
      transform = `translateY(${interpolate(progress, [0, 1], [-30, 0])}px)`;
      break;
    case 'left':
      transform = `translateX(${interpolate(progress, [0, 1], [30, 0])}px)`;
      break;
    case 'right':
      transform = `translateX(${interpolate(progress, [0, 1], [-30, 0])}px)`;
      break;
    case 'scale':
      transform = `scale(${interpolate(progress, [0, 1], [0.9, 1])})`;
      break;
  }

  return {
    opacity,
    transform,
    style: { opacity, transform },
    progress,
  };
}

/**
 * Focus pull effect - blur to sharp transition
 */
export function useFocusPull(config: {
  startFrame?: number;
  duration?: number;
  maxBlur?: number;
} = {}): {
  filter: string;
  progress: number;
} {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const {
    startFrame = 0,
    duration = 25,
    maxBlur = 12,
  } = config;

  const progress = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 30, stiffness: 100 },
    durationInFrames: duration,
  });

  const blur = interpolate(progress, [0, 1], [maxBlur, 0], {
    extrapolateRight: 'clamp',
  });

  return {
    filter: blur > 0.5 ? `blur(${blur}px)` : 'none',
    progress,
  };
}

/**
 * Zoom focus effect - subtle zoom towards focal point
 */
export function useZoomFocus(config: {
  startFrame?: number;
  duration?: number;
  focusX?: number;
  focusY?: number;
  zoomAmount?: number;
} = {}): {
  transform: string;
  scale: number;
} {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const {
    startFrame = 0,
    duration = 40,
    focusX = 50,
    focusY = 50,
    zoomAmount = 0.05,
  } = config;

  const progress = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 50, stiffness: 80 },
    durationInFrames: duration,
  });

  const scale = 1 + interpolate(progress, [0, 1], [0, zoomAmount]);

  // Transform origin offset
  const originX = (focusX - 50) * 0.01;
  const originY = (focusY - 50) * 0.01;

  return {
    transform: `scale(${scale}) translate(${-originX * scale * 100}%, ${-originY * scale * 100}%)`,
    scale,
  };
}

/**
 * Pan effect for content changes
 */
export function useCameraPan(config: {
  segments: Array<{ frame: number; x?: number; y?: number }>;
  transitionDuration?: number;
} = { segments: [] }): {
  x: number;
  y: number;
  transform: string;
} {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { segments, transitionDuration = 30 } = config;

  if (segments.length === 0) {
    return { x: 0, y: 0, transform: 'translate(0px, 0px)' };
  }

  // Find current segment
  let fromIdx = 0;
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg && frame >= seg.frame) {
      fromIdx = i;
      break;
    }
  }

  const toIdx = Math.min(fromIdx + 1, segments.length - 1);
  const fromSeg = segments[fromIdx];
  const toSeg = segments[toIdx];

  if (!fromSeg || !toSeg || fromIdx === toIdx) {
    const x = fromSeg?.x ?? 0;
    const y = fromSeg?.y ?? 0;
    return { x, y, transform: `translate(${x}px, ${y}px)` };
  }

  const progress = spring({
    frame: frame - fromSeg.frame,
    fps,
    config: CAMERA_SPRINGS.cinematic,
    durationInFrames: transitionDuration,
  });

  const x = interpolate(progress, [0, 1], [fromSeg.x ?? 0, toSeg.x ?? 0]);
  const y = interpolate(progress, [0, 1], [fromSeg.y ?? 0, toSeg.y ?? 0]);

  return {
    x,
    y,
    transform: `translate(${x}px, ${y}px)`,
  };
}
