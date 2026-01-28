/**
 * Isometric View Utilities
 *
 * Presets and utilities for isometric browser/UI views.
 * Creates professional 3D presentations of flat UI content.
 */

import type { CSSProperties } from 'react';

// ============================================================================
// Types
// ============================================================================

export type IsometricPreset = {
  /** Rotation around X axis (degrees) */
  rotateX: number;
  /** Rotation around Y axis (degrees) */
  rotateY: number;
  /** Rotation around Z axis (degrees) */
  rotateZ: number;
  /** Perspective distance (px) */
  perspective: number;
  /** Scale factor */
  scale: number;
  /** Transform origin */
  origin: string;
};

export type IsometricConfig = {
  /** Preset name or custom config */
  preset?: IsometricPresetName | IsometricPreset;
  /** Override rotation X */
  rotateX?: number;
  /** Override rotation Y */
  rotateY?: number;
  /** Override rotation Z */
  rotateZ?: number;
  /** Override perspective */
  perspective?: number;
  /** Override scale */
  scale?: number;
  /** Enable shadow */
  shadow?: boolean;
  /** Shadow intensity (0-1) */
  shadowIntensity?: number;
};

// ============================================================================
// Isometric Presets
// ============================================================================

/**
 * Isometric view presets for different use cases
 */
export const ISOMETRIC_PRESETS = {
  /**
   * Subtle - barely noticeable depth
   * Good for: hero sections, feature highlights
   */
  subtle: {
    rotateX: 8,
    rotateY: 12,
    rotateZ: -2,
    perspective: 2000,
    scale: 1,
    origin: '50% 50%',
  },

  /**
   * Medium - noticeable but not extreme
   * Good for: product showcases, comparisons
   */
  medium: {
    rotateX: 15,
    rotateY: 20,
    rotateZ: -3,
    perspective: 1500,
    scale: 0.95,
    origin: '50% 50%',
  },

  /**
   * Heroic - dramatic presentation angle
   * Good for: splash screens, key features
   */
  heroic: {
    rotateX: 45,
    rotateY: 35,
    rotateZ: -5,
    perspective: 1200,
    scale: 0.9,
    origin: '50% 60%',
  },

  /**
   * Top-down - looking down at content
   * Good for: dashboard views, data visualization
   */
  topDown: {
    rotateX: 55,
    rotateY: 0,
    rotateZ: 0,
    perspective: 1000,
    scale: 0.85,
    origin: '50% 80%',
  },

  /**
   * Side view - tilted to the side
   * Good for: before/after, timeline views
   */
  sideView: {
    rotateX: 10,
    rotateY: 45,
    rotateZ: -2,
    perspective: 1400,
    scale: 0.92,
    origin: '30% 50%',
  },

  /**
   * Float - subtle lift effect
   * Good for: cards, modals, floating UI
   */
  float: {
    rotateX: 5,
    rotateY: 5,
    rotateZ: -1,
    perspective: 2500,
    scale: 1.02,
    origin: '50% 50%',
  },

  /**
   * Flat - no rotation, just perspective depth
   */
  flat: {
    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,
    perspective: 1200,
    scale: 1,
    origin: '50% 50%',
  },
} as const;

export type IsometricPresetName = keyof typeof ISOMETRIC_PRESETS;

// ============================================================================
// Style Generation
// ============================================================================

/**
 * Get isometric transform styles
 */
export function getIsometricStyle(config: IsometricConfig = {}): CSSProperties {
  // Get base preset
  const presetName = typeof config.preset === 'string' ? config.preset : 'subtle';
  const basePreset = typeof config.preset === 'object'
    ? config.preset
    : ISOMETRIC_PRESETS[presetName];

  // Apply overrides
  const rotateX = config.rotateX ?? basePreset.rotateX;
  const rotateY = config.rotateY ?? basePreset.rotateY;
  const rotateZ = config.rotateZ ?? basePreset.rotateZ;
  const perspective = config.perspective ?? basePreset.perspective;
  const scale = config.scale ?? basePreset.scale;
  const origin = basePreset.origin;

  const transform = `
    perspective(${perspective}px)
    rotateX(${rotateX}deg)
    rotateY(${rotateY}deg)
    rotateZ(${rotateZ}deg)
    scale(${scale})
  `.replace(/\s+/g, ' ').trim();

  return {
    transform,
    transformOrigin: origin,
    transformStyle: 'preserve-3d' as const,
  };
}

/**
 * Get wrapper style for perspective container
 */
export function getIsometricWrapperStyle(perspective = 1500): CSSProperties {
  return {
    perspective: `${perspective}px`,
    perspectiveOrigin: '50% 50%',
    transformStyle: 'preserve-3d' as const,
  };
}

/**
 * Get shadow style for isometric elements
 */
export function getIsometricShadow(config: IsometricConfig = {}): CSSProperties {
  const { shadow = true, shadowIntensity = 0.15 } = config;

  if (!shadow) {
    return {};
  }

  // Get rotation values to calculate shadow direction
  const presetName = typeof config.preset === 'string' ? config.preset : 'subtle';
  const basePreset = typeof config.preset === 'object'
    ? config.preset
    : ISOMETRIC_PRESETS[presetName];

  const rotateX = config.rotateX ?? basePreset.rotateX;
  const rotateY = config.rotateY ?? basePreset.rotateY;

  // Calculate shadow offset based on rotation
  const shadowX = Math.sin((rotateY * Math.PI) / 180) * 30;
  const shadowY = Math.sin((rotateX * Math.PI) / 180) * 20 + 20;
  const shadowBlur = 40 + Math.abs(rotateX) + Math.abs(rotateY);

  return {
    boxShadow: `${shadowX}px ${shadowY}px ${shadowBlur}px rgba(0, 0, 0, ${shadowIntensity})`,
  };
}

/**
 * Get complete isometric styles including shadow
 */
export function getCompleteIsometricStyle(config: IsometricConfig = {}): CSSProperties {
  return {
    ...getIsometricStyle(config),
    ...getIsometricShadow(config),
  };
}

// ============================================================================
// Animation Helpers
// ============================================================================

/**
 * Interpolate between two isometric presets
 */
export function interpolateIsometric(
  from: IsometricPreset,
  to: IsometricPreset,
  progress: number,
): IsometricPreset {
  return {
    rotateX: from.rotateX + (to.rotateX - from.rotateX) * progress,
    rotateY: from.rotateY + (to.rotateY - from.rotateY) * progress,
    rotateZ: from.rotateZ + (to.rotateZ - from.rotateZ) * progress,
    perspective: from.perspective + (to.perspective - from.perspective) * progress,
    scale: from.scale + (to.scale - from.scale) * progress,
    origin: progress < 0.5 ? from.origin : to.origin,
  };
}

/**
 * Get animated isometric style based on progress
 */
export function getAnimatedIsometricStyle(
  fromPreset: IsometricPresetName,
  toPreset: IsometricPresetName,
  progress: number,
): CSSProperties {
  const from = ISOMETRIC_PRESETS[fromPreset];
  const to = ISOMETRIC_PRESETS[toPreset];
  const interpolated = interpolateIsometric(from, to, progress);

  return getIsometricStyle({ preset: interpolated });
}
