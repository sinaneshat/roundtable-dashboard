/**
 * Advanced Depth Layer Hook
 *
 * React hook for managing 6-layer depth parallax and blur effects.
 */

import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import { useCurrentFrame } from 'remotion';

import type { DepthLayerName, DepthLayerState } from '../lib/depth-layers';
import {
  DEPTH_LAYERS,
  getAllLayerStates,
  getDepthLayerState,
  getLayerDepth,
  getParallaxPushStyle,
  LAYER_ORDER,
  rackFocus,
} from '../lib/depth-layers';

// ============================================================================
// Types
// ============================================================================

export type UseDepthLayerConfig = {
  /** Layer to apply effect to */
  layer: DepthLayerName;
  /** Camera X offset for parallax */
  cameraX?: number;
  /** Camera Y offset for parallax */
  cameraY?: number;
  /** Which layer is currently in focus */
  focusLayer?: DepthLayerName;
  /** Aperture for depth blur (lower = more blur) */
  aperture?: number;
};

export type UseDepthLayersConfig = {
  /** Camera X offset for parallax */
  cameraX?: number;
  /** Camera Y offset for parallax */
  cameraY?: number;
  /** Which layer is currently in focus */
  focusLayer?: DepthLayerName;
  /** Aperture for depth blur */
  aperture?: number;
};

export type UseRackFocusConfig = {
  /** Starting focus layer */
  fromLayer: DepthLayerName;
  /** Ending focus layer */
  toLayer: DepthLayerName;
  /** Frame to start focus transition */
  startFrame: number;
  /** Duration of focus transition in frames */
  duration: number;
  /** Camera X offset for parallax */
  cameraX?: number;
  /** Camera Y offset for parallax */
  cameraY?: number;
  /** Aperture for depth blur */
  aperture?: number;
};

export type UseParallaxPushConfig = {
  /** Push direction */
  direction?: 'in' | 'out';
  /** Maximum push distance in pixels */
  maxPush?: number;
  /** Progress of the push (0-1) */
  progress: number;
};

// ============================================================================
// Single Layer Hook
// ============================================================================

/**
 * Hook for getting depth layer state for a single layer
 *
 * @example
 * const { style } = useDepthLayer({
 *   layer: 'far',
 *   cameraX: camera.x,
 *   cameraY: camera.y,
 *   focusLayer: 'focus',
 * });
 *
 * return <div style={style}>Background content</div>;
 */
export function useDepthLayer(config: UseDepthLayerConfig): DepthLayerState {
  const frame = useCurrentFrame();

  const {
    layer,
    cameraX = 0,
    cameraY = 0,
    focusLayer = 'focus',
    aperture = 2.8,
  } = config;

  return useMemo(() => {
    return getDepthLayerState(layer, frame, cameraX, cameraY, focusLayer, aperture);
  }, [layer, frame, cameraX, cameraY, focusLayer, aperture]);
}

// ============================================================================
// All Layers Hook
// ============================================================================

/**
 * Hook for getting depth layer states for all layers at once
 *
 * @example
 * const layers = useDepthLayers({
 *   cameraX: camera.x,
 *   cameraY: camera.y,
 *   focusLayer: 'focus',
 * });
 *
 * return (
 *   <>
 *     <div style={layers.veryFar.style}>Very far bg</div>
 *     <div style={layers.far.style}>Far bg</div>
 *     <div style={layers.focus.style}>Main content</div>
 *   </>
 * );
 */
export function useDepthLayers(config: UseDepthLayersConfig = {}): Record<DepthLayerName, DepthLayerState> {
  const frame = useCurrentFrame();

  const {
    cameraX = 0,
    cameraY = 0,
    focusLayer = 'focus',
    aperture = 2.8,
  } = config;

  return useMemo(() => {
    return getAllLayerStates(frame, cameraX, cameraY, focusLayer, aperture);
  }, [frame, cameraX, cameraY, focusLayer, aperture]);
}

// ============================================================================
// Rack Focus Hook
// ============================================================================

/**
 * Hook for animated focus transitions between layers
 *
 * @example
 * const { currentFocusLayer, layers } = useRackFocus({
 *   fromLayer: 'far',
 *   toLayer: 'focus',
 *   startFrame: 30,
 *   duration: 20,
 * });
 */
export function useRackFocus(config: UseRackFocusConfig): {
  currentFocusLayer: DepthLayerName;
  focusProgress: number;
  interpolatedDepth: number;
  layers: Record<DepthLayerName, DepthLayerState>;
} {
  const frame = useCurrentFrame();

  const {
    fromLayer,
    toLayer,
    startFrame,
    duration,
    cameraX = 0,
    cameraY = 0,
    aperture = 2.8,
  } = config;

  return useMemo(() => {
    const { currentFocusLayer, focusProgress, interpolatedDepth } = rackFocus(
      frame,
      fromLayer,
      toLayer,
      startFrame,
      duration,
    );

    const layers = getAllLayerStates(
      frame,
      cameraX,
      cameraY,
      currentFocusLayer,
      aperture,
    );

    return {
      currentFocusLayer,
      focusProgress,
      interpolatedDepth,
      layers,
    };
  }, [frame, fromLayer, toLayer, startFrame, duration, cameraX, cameraY, aperture]);
}

// ============================================================================
// Parallax Push Hook
// ============================================================================

/**
 * Hook for parallax push transition effect
 *
 * @example
 * const pushStyles = useParallaxPush({
 *   direction: 'out',
 *   maxPush: 500,
 *   progress: transitionProgress,
 * });
 *
 * return (
 *   <>
 *     <div style={pushStyles.veryFar}>Very far content</div>
 *     <div style={pushStyles.far}>Far content</div>
 *     <div style={pushStyles.focus}>Main content</div>
 *   </>
 * );
 */
export function useParallaxPush(config: UseParallaxPushConfig): Record<DepthLayerName, CSSProperties> {
  const {
    direction = 'out',
    maxPush = 500,
    progress,
  } = config;

  return useMemo(() => {
    const styles = {} as Record<DepthLayerName, CSSProperties>;

    for (const layer of LAYER_ORDER) {
      styles[layer] = getParallaxPushStyle(layer, progress, direction, maxPush);
    }

    return styles;
  }, [direction, maxPush, progress]);
}

// ============================================================================
// Helper Hooks
// ============================================================================

/**
 * Get layer depth value
 */
export function useLayerDepth(layer: DepthLayerName): number {
  return useMemo(() => getLayerDepth(layer), [layer]);
}

/**
 * Get layer configuration
 */
export function useLayerConfig(layer: DepthLayerName) {
  return useMemo(() => DEPTH_LAYERS[layer], [layer]);
}

/**
 * Get ordered list of layer names
 */
export function getLayerOrder(): DepthLayerName[] {
  return LAYER_ORDER;
}
