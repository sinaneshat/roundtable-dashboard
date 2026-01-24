/**
 * 3D Camera Effects for Remotion
 *
 * Provides cinematic camera movements with depth blur and parallax effects.
 * All effects are frame-based for deterministic rendering.
 */

import type { CSSProperties } from 'react';
import { interpolate, spring } from 'remotion';

// ============================================================================
// Types
// ============================================================================

export type CameraPosition = {
  x: number; // Horizontal offset (-100 to 100)
  y: number; // Vertical offset (-100 to 100)
  z: number; // Depth/zoom (0.5 to 2.0, 1.0 = normal)
  rotateX: number; // Tilt (degrees)
  rotateY: number; // Pan (degrees)
  rotateZ: number; // Roll (degrees)
};

export type DepthLayer = 'background' | 'mid' | 'focus' | 'foreground';

export type SpringConfig = {
  damping: number;
  stiffness: number;
  mass: number;
};

// ============================================================================
// Spring Presets for Camera
// ============================================================================

export const CAMERA_SPRINGS: Record<string, SpringConfig> = {
  // Smooth cinematic movement
  cinematic: { damping: 200, stiffness: 100, mass: 1 },
  // Quick snap to position
  snap: { damping: 30, stiffness: 300, mass: 0.5 },
  // Dreamy float
  float: { damping: 100, stiffness: 50, mass: 2 },
  // Bouncy landing
  bounce: { damping: 15, stiffness: 200, mass: 0.8 },
};

// ============================================================================
// Depth Layer Configuration
// ============================================================================

export const DEPTH_LAYERS: Record<DepthLayer, { blur: number; scale: number; opacity: number; zIndex: number }> = {
  background: { blur: 20, scale: 0.95, opacity: 0.3, zIndex: 0 },
  mid: { blur: 4, scale: 0.98, opacity: 0.7, zIndex: 10 },
  focus: { blur: 0, scale: 1.0, opacity: 1.0, zIndex: 20 },
  foreground: { blur: 2, scale: 1.02, opacity: 0.9, zIndex: 30 },
};

// ============================================================================
// Camera Movement Functions
// ============================================================================

/**
 * Calculate camera position at a given frame
 */
export function getCameraPosition(
  frame: number,
  fps: number,
  from: CameraPosition,
  to: CameraPosition,
  startFrame: number,
  durationFrames: number,
  springConfig: SpringConfig = CAMERA_SPRINGS.cinematic!,
): CameraPosition {
  const progress = spring({
    frame: frame - startFrame,
    fps,
    config: springConfig,
    durationInFrames: durationFrames,
  });

  return {
    x: interpolate(progress, [0, 1], [from.x, to.x]),
    y: interpolate(progress, [0, 1], [from.y, to.y]),
    z: interpolate(progress, [0, 1], [from.z, to.z]),
    rotateX: interpolate(progress, [0, 1], [from.rotateX, to.rotateX]),
    rotateY: interpolate(progress, [0, 1], [from.rotateY, to.rotateY]),
    rotateZ: interpolate(progress, [0, 1], [from.rotateZ, to.rotateZ]),
  };
}

/**
 * Convert camera position to CSS transform
 */
export function cameraToTransform(camera: CameraPosition): string {
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
 * Get styles for a depth layer with parallax effect
 */
export function getDepthLayerStyles(
  layer: DepthLayer,
  camera: CameraPosition,
): CSSProperties {
  const config = DEPTH_LAYERS[layer];

  // Parallax multiplier: background moves less, foreground moves more
  const parallaxMultiplier = {
    background: 0.3,
    mid: 0.6,
    focus: 1.0,
    foreground: 1.4,
  }[layer];

  const parallaxX = camera.x * parallaxMultiplier;
  const parallaxY = camera.y * parallaxMultiplier;
  const parallaxScale = 1 + (camera.z - 1) * parallaxMultiplier;

  return {
    filter: config.blur > 0 ? `blur(${config.blur}px)` : undefined,
    transform: `translate(${parallaxX}px, ${parallaxY}px) scale(${config.scale * parallaxScale})`,
    opacity: config.opacity,
    zIndex: config.zIndex,
    position: 'absolute' as const,
    inset: 0,
  };
}

// ============================================================================
// Pre-built Camera Movements
// ============================================================================

export const DEFAULT_CAMERA: CameraPosition = {
  x: 0,
  y: 0,
  z: 1,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
};

/**
 * Dolly movement (horizontal track)
 */
export function dollyRight(distance: number): CameraPosition {
  return { ...DEFAULT_CAMERA, x: -distance };
}

export function dollyLeft(distance: number): CameraPosition {
  return { ...DEFAULT_CAMERA, x: distance };
}

/**
 * Truck movement (vertical track)
 */
export function truckUp(distance: number): CameraPosition {
  return { ...DEFAULT_CAMERA, y: distance };
}

export function truckDown(distance: number): CameraPosition {
  return { ...DEFAULT_CAMERA, y: -distance };
}

/**
 * Zoom movement
 */
export function zoomIn(factor: number = 1.2): CameraPosition {
  return { ...DEFAULT_CAMERA, z: factor };
}

export function zoomOut(factor: number = 0.8): CameraPosition {
  return { ...DEFAULT_CAMERA, z: factor };
}

/**
 * Tilt movement (rotation around X axis)
 */
export function tiltUp(degrees: number = 5): CameraPosition {
  return { ...DEFAULT_CAMERA, rotateX: degrees };
}

export function tiltDown(degrees: number = 5): CameraPosition {
  return { ...DEFAULT_CAMERA, rotateX: -degrees };
}

/**
 * Pan movement (rotation around Y axis)
 */
export function panLeft(degrees: number = 5): CameraPosition {
  return { ...DEFAULT_CAMERA, rotateY: degrees };
}

export function panRight(degrees: number = 5): CameraPosition {
  return { ...DEFAULT_CAMERA, rotateY: -degrees };
}

/**
 * Orbit movement (combined pan and dolly for circular motion)
 */
export function orbit(angle: number, radius: number = 50): CameraPosition {
  const rad = (angle * Math.PI) / 180;
  return {
    ...DEFAULT_CAMERA,
    x: Math.sin(rad) * radius,
    rotateY: -angle * 0.3,
  };
}

/**
 * Hero shot - dramatic zoom with slight tilt
 */
export function heroShot(zoomFactor: number = 1.3): CameraPosition {
  return {
    ...DEFAULT_CAMERA,
    z: zoomFactor,
    rotateX: 3,
  };
}

/**
 * Reveal shot - start zoomed in, pull back
 */
export function revealStart(): CameraPosition {
  return {
    ...DEFAULT_CAMERA,
    z: 1.5,
    y: 20,
  };
}

// ============================================================================
// Transition Helpers
// ============================================================================

/**
 * Create a smooth camera path through multiple positions
 */
export function createCameraPath(
  positions: Array<{ position: CameraPosition; frame: number }>,
  frame: number,
  fps: number,
  transitionDuration: number = 30,
  springConfig: SpringConfig = CAMERA_SPRINGS.cinematic!,
): CameraPosition {
  // Find current segment
  let fromIdx = 0;
  for (let i = positions.length - 1; i >= 0; i--) {
    const pos = positions[i];
    if (pos && frame >= pos.frame) {
      fromIdx = i;
      break;
    }
  }

  const toIdx = Math.min(fromIdx + 1, positions.length - 1);
  const fromPos = positions[fromIdx];
  const toPos = positions[toIdx];

  if (!fromPos || !toPos || fromIdx === toIdx) {
    return fromPos?.position ?? DEFAULT_CAMERA;
  }

  return getCameraPosition(
    frame,
    fps,
    fromPos.position,
    toPos.position,
    fromPos.frame,
    transitionDuration,
    springConfig,
  );
}

// ============================================================================
// Depth of Field Effect
// ============================================================================

/**
 * Calculate blur based on distance from focus point
 */
export function depthOfFieldBlur(
  elementDepth: number, // 0 = focus plane, negative = closer, positive = further
  aperture: number = 2.8, // Lower = more blur, higher = less blur
): number {
  const blurAmount = Math.abs(elementDepth) * (10 / aperture);
  return Math.min(blurAmount, 30); // Cap at 30px
}

/**
 * Get styles for an element at a specific depth
 */
export function getDepthStyles(
  depth: number,
  focusDepth: number = 0,
  aperture: number = 2.8,
): CSSProperties {
  const distance = depth - focusDepth;
  const blur = depthOfFieldBlur(distance, aperture);
  const scale = 1 - distance * 0.02; // Subtle scale for depth perception

  return {
    filter: blur > 0.5 ? `blur(${blur}px)` : undefined,
    transform: `scale(${Math.max(0.8, Math.min(1.2, scale))})`,
    zIndex: Math.round((1 - depth) * 100),
  };
}

// ============================================================================
// Floating Particle Effect
// ============================================================================

export type Particle = {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  depth: number;
  opacity: number;
};

/**
 * Generate random particles for background effect
 */
export function generateParticles(count: number, seed: number = 42): Particle[] {
  // Simple seeded random for deterministic particles
  const random = (n: number) => {
    const x = Math.sin(seed + n) * 10000;
    return x - Math.floor(x);
  };

  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: random(i * 3) * 100,
    y: random(i * 3 + 1) * 100,
    size: 2 + random(i * 3 + 2) * 6,
    speed: 0.5 + random(i * 3 + 3) * 1.5,
    depth: random(i * 3 + 4) * 3 - 1.5, // -1.5 to 1.5
    opacity: 0.1 + random(i * 3 + 5) * 0.3,
  }));
}

/**
 * Get particle position at a given frame
 */
export function getParticlePosition(
  particle: Particle,
  frame: number,
  camera: CameraPosition,
): { x: number; y: number; opacity: number; blur: number } {
  // Parallax based on particle depth
  const parallaxFactor = 1 + particle.depth * 0.3;

  // Gentle floating motion
  const floatX = Math.sin(frame * 0.02 * particle.speed + particle.id) * 10;
  const floatY = Math.cos(frame * 0.015 * particle.speed + particle.id * 2) * 8;

  return {
    x: particle.x + floatX - camera.x * parallaxFactor,
    y: particle.y + floatY - camera.y * parallaxFactor,
    opacity: particle.opacity * (1 - Math.abs(particle.depth) * 0.2),
    blur: Math.abs(particle.depth) * 3,
  };
}
