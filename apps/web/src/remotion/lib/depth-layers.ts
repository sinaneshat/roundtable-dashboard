/**
 * Advanced Depth Layer System
 *
 * 6-layer depth system for cinematic parallax and depth-of-field effects.
 * Each layer has configurable parallax, blur, opacity, and motion properties.
 */

import type { CSSProperties } from 'react';
import { interpolate } from 'remotion';

// ============================================================================
// Types
// ============================================================================

export type DepthLayerName = 'veryFar' | 'far' | 'mid' | 'focus' | 'near' | 'veryNear';

export type DepthLayerConfig = {
  /** Parallax movement multiplier (0 = no movement, 1 = full movement) */
  parallaxMultiplier: number;
  /** Base blur in pixels */
  baseBlur: number;
  /** Blur multiplier when out of focus */
  blurMultiplier: number;
  /** Base opacity */
  baseOpacity: number;
  /** Opacity multiplier when out of focus */
  opacityMultiplier: number;
  /** Z-index for stacking */
  zIndex: number;
  /** Scale factor for depth perception */
  scale: number;
  /** Motion damping (higher = slower motion) */
  motionDamping: number;
  /** Floating motion amplitude */
  floatAmplitude: number;
};

export type DepthLayerState = {
  /** CSS transform string */
  transform: string;
  /** CSS filter string */
  filter: string;
  /** Opacity value */
  opacity: number;
  /** Z-index for stacking */
  zIndex: number;
  /** Full CSS style object */
  style: CSSProperties;
};

// ============================================================================
// Layer Configurations
// ============================================================================

/**
 * 6-layer depth system configuration
 *
 * veryFar - Distant background, heavy blur, slow movement
 * far - Background elements, moderate blur
 * mid - Middle ground, slight blur
 * focus - Main content, sharp focus
 * near - Foreground elements, slight blur
 * veryNear - Close foreground, heavy blur, fast movement
 */
export const DEPTH_LAYERS: Record<DepthLayerName, DepthLayerConfig> = {
  veryFar: {
    parallaxMultiplier: 0.15,
    baseBlur: 25,
    blurMultiplier: 1.2,
    baseOpacity: 0.3,
    opacityMultiplier: 0.6,
    zIndex: 0,
    scale: 0.92,
    motionDamping: 2.5,
    floatAmplitude: 1.5,
  },
  far: {
    parallaxMultiplier: 0.3,
    baseBlur: 12,
    blurMultiplier: 1.0,
    baseOpacity: 0.5,
    opacityMultiplier: 0.7,
    zIndex: 10,
    scale: 0.96,
    motionDamping: 2.0,
    floatAmplitude: 2.5,
  },
  mid: {
    parallaxMultiplier: 0.6,
    baseBlur: 4,
    blurMultiplier: 0.8,
    baseOpacity: 0.75,
    opacityMultiplier: 0.85,
    zIndex: 20,
    scale: 0.98,
    motionDamping: 1.5,
    floatAmplitude: 3.5,
  },
  focus: {
    parallaxMultiplier: 1.0,
    baseBlur: 0,
    blurMultiplier: 0,
    baseOpacity: 1.0,
    opacityMultiplier: 1.0,
    zIndex: 30,
    scale: 1.0,
    motionDamping: 1.0,
    floatAmplitude: 4.0,
  },
  near: {
    parallaxMultiplier: 1.3,
    baseBlur: 3,
    blurMultiplier: 0.6,
    baseOpacity: 0.9,
    opacityMultiplier: 0.95,
    zIndex: 40,
    scale: 1.02,
    motionDamping: 0.8,
    floatAmplitude: 5.0,
  },
  veryNear: {
    parallaxMultiplier: 1.6,
    baseBlur: 15,
    blurMultiplier: 1.0,
    baseOpacity: 0.6,
    opacityMultiplier: 0.7,
    zIndex: 50,
    scale: 1.05,
    motionDamping: 0.5,
    floatAmplitude: 6.0,
  },
};

/**
 * Ordered layer names from back to front
 */
export const LAYER_ORDER: DepthLayerName[] = [
  'veryFar',
  'far',
  'mid',
  'focus',
  'near',
  'veryNear',
];

/**
 * Get layer index (0-5) from layer name
 */
export function getLayerIndex(layer: DepthLayerName): number {
  return LAYER_ORDER.indexOf(layer);
}

/**
 * Get layer depth value (-2 to 2, 0 = focus)
 */
export function getLayerDepth(layer: DepthLayerName): number {
  const index = getLayerIndex(layer);
  // Map 0-5 to -2.5 to 2.5 (focus at 0)
  return (index - 3) * 1.0;
}

// ============================================================================
// Layer State Calculations
// ============================================================================

/**
 * Calculate depth layer state at a given frame
 */
export function getDepthLayerState(
  layer: DepthLayerName,
  frame: number,
  cameraX: number = 0,
  cameraY: number = 0,
  cameraFocusLayer: DepthLayerName = 'focus',
  aperture: number = 2.8,
): DepthLayerState {
  const config = DEPTH_LAYERS[layer];

  // Calculate parallax offset
  const parallaxX = cameraX * config.parallaxMultiplier;
  const parallaxY = cameraY * config.parallaxMultiplier;

  // Floating motion based on layer
  const floatSpeed = 0.01 / config.motionDamping;
  const floatX = Math.sin(frame * floatSpeed) * config.floatAmplitude;
  const floatY = Math.cos(frame * floatSpeed * 0.7) * config.floatAmplitude * 0.6;

  // Calculate blur based on distance from focus layer
  const layerDepth = getLayerDepth(layer);
  const focusDepth = getLayerDepth(cameraFocusLayer);
  const depthDistance = Math.abs(layerDepth - focusDepth);

  // Blur increases with distance from focus and lower aperture
  const depthBlur = depthDistance * config.baseBlur * (10 / aperture) * 0.3;
  const totalBlur = config.baseBlur + depthBlur * config.blurMultiplier;

  // Opacity decreases with distance from focus
  const opacityFalloff = 1 - depthDistance * 0.15;
  const opacity = config.baseOpacity * config.opacityMultiplier * Math.max(0.3, opacityFalloff);

  // Build transform
  const transform = `
    translateX(${parallaxX + floatX}px)
    translateY(${parallaxY + floatY}px)
    scale(${config.scale})
  `.replace(/\s+/g, ' ').trim();

  // Build filter
  const filter = totalBlur > 0.5 ? `blur(${totalBlur.toFixed(1)}px)` : 'none';

  return {
    transform,
    filter,
    opacity,
    zIndex: config.zIndex,
    style: {
      transform,
      filter: filter !== 'none' ? filter : undefined,
      opacity,
      zIndex: config.zIndex,
      position: 'absolute' as const,
      inset: 0,
      willChange: 'transform, filter, opacity',
    },
  };
}

/**
 * Get all layer states for a scene
 */
export function getAllLayerStates(
  frame: number,
  cameraX: number = 0,
  cameraY: number = 0,
  cameraFocusLayer: DepthLayerName = 'focus',
  aperture: number = 2.8,
): Record<DepthLayerName, DepthLayerState> {
  const states = {} as Record<DepthLayerName, DepthLayerState>;

  for (const layer of LAYER_ORDER) {
    states[layer] = getDepthLayerState(
      layer,
      frame,
      cameraX,
      cameraY,
      cameraFocusLayer,
      aperture,
    );
  }

  return states;
}

// ============================================================================
// Focus Rack / Pull Focus
// ============================================================================

/**
 * Calculate focus transition between layers
 */
export function rackFocus(
  frame: number,
  fromLayer: DepthLayerName,
  toLayer: DepthLayerName,
  startFrame: number,
  durationFrames: number,
): {
  currentFocusLayer: DepthLayerName;
  focusProgress: number;
  interpolatedDepth: number;
} {
  const progress = interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const fromDepth = getLayerDepth(fromLayer);
  const toDepth = getLayerDepth(toLayer);
  const interpolatedDepth = interpolate(progress, [0, 1], [fromDepth, toDepth]);

  // Determine current focus layer based on interpolated depth
  let currentFocusLayer: DepthLayerName = fromLayer;
  if (progress >= 1) {
    currentFocusLayer = toLayer;
  } else if (progress > 0) {
    // Find closest layer to interpolated depth
    let minDistance = Infinity;
    for (const layer of LAYER_ORDER) {
      const layerDepth = getLayerDepth(layer);
      const distance = Math.abs(layerDepth - interpolatedDepth);
      if (distance < minDistance) {
        minDistance = distance;
        currentFocusLayer = layer;
      }
    }
  }

  return {
    currentFocusLayer,
    focusProgress: progress,
    interpolatedDepth,
  };
}

// ============================================================================
// Parallax Push Effect
// ============================================================================

/**
 * Calculate parallax push state for transition effects
 * Each layer pushes at different speeds creating depth illusion
 */
export function getParallaxPushState(
  layer: DepthLayerName,
  progress: number, // 0 to 1
  pushDirection: 'in' | 'out' = 'out',
  maxPush: number = 500,
): {
  translateZ: number;
  scale: number;
  blur: number;
  opacity: number;
} {
  const config = DEPTH_LAYERS[layer];
  const layerIndex = getLayerIndex(layer);

  // Layers push at different speeds - front layers push faster
  const pushMultiplier = pushDirection === 'out'
    ? 0.5 + (layerIndex / 5) * 1.5 // 0.5 to 2.0
    : 2.0 - (layerIndex / 5) * 1.5; // 2.0 to 0.5

  const translateZ = progress * maxPush * pushMultiplier * (pushDirection === 'out' ? -1 : 1);

  // Scale decreases as layers push back
  const scaleDelta = progress * 0.3 * pushMultiplier;
  const scale = pushDirection === 'out'
    ? config.scale - scaleDelta
    : config.scale + scaleDelta * 0.5;

  // Blur increases with distance
  const blurIncrease = progress * 20 * pushMultiplier;
  const blur = config.baseBlur + blurIncrease;

  // Opacity fades as layers push back
  const opacityFade = progress * 0.5 * pushMultiplier;
  const opacity = Math.max(0, config.baseOpacity - opacityFade);

  return {
    translateZ,
    scale: Math.max(0.5, scale),
    blur,
    opacity,
  };
}

/**
 * Get CSS properties for parallax push effect
 */
export function getParallaxPushStyle(
  layer: DepthLayerName,
  progress: number,
  pushDirection: 'in' | 'out' = 'out',
  maxPush: number = 500,
): CSSProperties {
  const state = getParallaxPushState(layer, progress, pushDirection, maxPush);

  return {
    transform: `translateZ(${state.translateZ}px) scale(${state.scale})`,
    filter: state.blur > 0.5 ? `blur(${state.blur}px)` : undefined,
    opacity: state.opacity,
    zIndex: DEPTH_LAYERS[layer].zIndex,
    transformStyle: 'preserve-3d' as const,
    backfaceVisibility: 'hidden' as const,
  };
}
