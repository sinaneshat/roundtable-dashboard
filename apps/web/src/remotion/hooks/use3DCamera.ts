/**
 * 3D Camera Effect Hooks for Remotion
 *
 * Provides reusable hooks for 3D perspective transforms, depth blur,
 * camera orbits, entrance animations, and parallax layers.
 */

import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import { SPRING_CONFIGS } from '../lib/easing';

// ============================================================================
// Types
// ============================================================================

export type Perspective3DConfig = {
  cameraDistance: number;
  rotateX?: number;
  rotateY?: number;
  rotateZ?: number;
};

export type Perspective3DResult = {
  perspective: string;
  transform: string;
  transformOrigin: string;
  style: CSSProperties;
};

export type CameraOrbitConfig = {
  speed: number;
  amplitude: { x: number; y: number };
};

export type CameraOrbitResult = {
  rotateX: number;
  rotateY: number;
};

export type Entrance3DConfig = {
  delay: number;
  duration: number;
  fromZ: number;
  fromRotate: { x: number; y: number; z: number };
};

export type Entrance3DResult = {
  z: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  opacity: number;
  blur: number;
  transform: string;
  style: CSSProperties;
  progress: number;
};

export type ParallaxLayersResult = {
  background: { transform: string; style: CSSProperties };
  midground: { transform: string; style: CSSProperties };
  foreground: { transform: string; style: CSSProperties };
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * Returns transform styles for 3D perspective camera
 *
 * @example
 * const { transform, style } = use3DPerspective({
 *   cameraDistance: 1500,
 *   rotateX: 0.02,
 *   rotateY: frame * 0.01,
 * });
 */
export function use3DPerspective(config: Perspective3DConfig): Perspective3DResult {
  const { cameraDistance, rotateX = 0, rotateY = 0, rotateZ = 0 } = config;

  return useMemo(() => {
    // Convert radians to degrees for CSS
    const rotateXDeg = rotateX * (180 / Math.PI);
    const rotateYDeg = rotateY * (180 / Math.PI);
    const rotateZDeg = rotateZ * (180 / Math.PI);

    const perspective = `${cameraDistance}px`;
    const transform = `rotateX(${rotateXDeg}deg) rotateY(${rotateYDeg}deg) rotateZ(${rotateZDeg}deg)`;
    const transformOrigin = 'center center';

    return {
      perspective,
      transform,
      transformOrigin,
      style: {
        perspective,
        transform,
        transformOrigin,
        transformStyle: 'preserve-3d' as const,
      },
    };
  }, [cameraDistance, rotateX, rotateY, rotateZ]);
}

/**
 * Returns blur amount based on z-distance from camera focus
 *
 * @example
 * const blur = useDepthBlur(100, 8); // z=100 from focus, max 8px blur
 * // Returns: "blur(5.33px)" (proportional to distance)
 */
export function useDepthBlur(zOffset: number, maxBlur: number): string {
  return useMemo(() => {
    // Normalize offset assuming typical range of -300 to 300
    const normalizedDistance = Math.abs(zOffset) / 300;
    const blurAmount = Math.min(normalizedDistance * maxBlur, maxBlur);

    if (blurAmount < 0.5) {
      return 'none';
    }

    return `blur(${blurAmount.toFixed(2)}px)`;
  }, [zOffset, maxBlur]);
}

/**
 * Returns orbiting camera rotation values
 *
 * @example
 * const orbit = useCameraOrbit({ speed: 0.01, amplitude: { x: 0.02, y: 0.03 } });
 * // orbit.rotateX and orbit.rotateY oscillate smoothly
 */
export function useCameraOrbit(config: CameraOrbitConfig): CameraOrbitResult {
  const frame = useCurrentFrame();
  const { speed, amplitude } = config;

  // Create smooth oscillating motion using sin/cos
  // speed is in radians per frame
  const phase = frame * speed;

  return {
    rotateX: Math.sin(phase) * amplitude.x,
    rotateY: Math.cos(phase * 0.7) * amplitude.y, // Slightly different frequency for organic feel
  };
}

/**
 * Returns entrance animation values for 3D elements
 *
 * @example
 * const entrance = use3DEntrance({
 *   delay: 10,
 *   duration: 30,
 *   fromZ: 200,
 *   fromRotate: { x: 0.1, y: 0.2, z: 0 },
 * });
 */
export function use3DEntrance(config: Entrance3DConfig): Entrance3DResult {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { delay, duration, fromZ, fromRotate } = config;

  const progress = spring({
    frame: frame - delay,
    fps,
    config: SPRING_CONFIGS.smooth,
    durationInFrames: duration,
  });

  // Interpolate z position (from offset to 0)
  const z = interpolate(progress, [0, 1], [fromZ, 0], {
    extrapolateRight: 'clamp',
  });

  // Interpolate rotations (from offset to 0)
  const rotateX = interpolate(progress, [0, 1], [fromRotate.x, 0], {
    extrapolateRight: 'clamp',
  });
  const rotateY = interpolate(progress, [0, 1], [fromRotate.y, 0], {
    extrapolateRight: 'clamp',
  });
  const rotateZ = interpolate(progress, [0, 1], [fromRotate.z, 0], {
    extrapolateRight: 'clamp',
  });

  // Opacity fades in faster than position settles
  const opacity = interpolate(progress, [0, 0.4], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Blur based on z distance
  const maxEntranceBlur = 15;
  const blur = interpolate(progress, [0, 1], [maxEntranceBlur, 0], {
    extrapolateRight: 'clamp',
  });

  // Convert radians to degrees
  const rotateXDeg = rotateX * (180 / Math.PI);
  const rotateYDeg = rotateY * (180 / Math.PI);
  const rotateZDeg = rotateZ * (180 / Math.PI);

  const transform = `translateZ(${z}px) rotateX(${rotateXDeg}deg) rotateY(${rotateYDeg}deg) rotateZ(${rotateZDeg}deg)`;

  return {
    z,
    rotateX,
    rotateY,
    rotateZ,
    opacity,
    blur,
    transform,
    style: {
      transform,
      opacity,
      filter: blur > 0.5 ? `blur(${blur.toFixed(2)}px)` : undefined,
    },
    progress,
  };
}

/**
 * Returns transforms for parallax depth layers
 * Different layers move at different speeds relative to scroll
 *
 * @example
 * const layers = useParallaxLayers(scrollOffset);
 * // layers.background moves slowest
 * // layers.midground moves at medium speed
 * // layers.foreground moves fastest
 */
export function useParallaxLayers(scrollOffset: number): ParallaxLayersResult {
  return useMemo(() => {
    // Parallax speed multipliers
    const PARALLAX_SPEEDS = {
      background: 0.2, // Moves slowest
      midground: 0.5, // Medium speed
      foreground: 1.2, // Moves fastest (creates depth illusion)
    };

    const backgroundOffset = scrollOffset * PARALLAX_SPEEDS.background;
    const midgroundOffset = scrollOffset * PARALLAX_SPEEDS.midground;
    const foregroundOffset = scrollOffset * PARALLAX_SPEEDS.foreground;

    return {
      background: {
        transform: `translateY(${backgroundOffset}px)`,
        style: {
          transform: `translateY(${backgroundOffset}px)`,
          willChange: 'transform' as const,
        },
      },
      midground: {
        transform: `translateY(${midgroundOffset}px)`,
        style: {
          transform: `translateY(${midgroundOffset}px)`,
          willChange: 'transform' as const,
        },
      },
      foreground: {
        transform: `translateY(${foregroundOffset}px)`,
        style: {
          transform: `translateY(${foregroundOffset}px)`,
          willChange: 'transform' as const,
        },
      },
    };
  }, [scrollOffset]);
}
