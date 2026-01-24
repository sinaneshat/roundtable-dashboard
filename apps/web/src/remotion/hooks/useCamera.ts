/**
 * Camera Animation Hook
 * Provides frame-based camera movement utilities for zoom, pan, and focus effects
 */

import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import { SPRING_CONFIGS } from '../lib/easing';

type CameraConfig = {
  startScale?: number;
  endScale?: number;
  startX?: number;
  endX?: number;
  startY?: number;
  endY?: number;
  delay?: number;
  durationInFrames?: number;
};

type CameraTransform = {
  scale: number;
  translateX: number;
  translateY: number;
  transform: string;
};

export function useCamera(config: CameraConfig = {}): CameraTransform {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const {
    startScale = 1,
    endScale = 1,
    startX = 0,
    endX = 0,
    startY = 0,
    endY = 0,
    delay = 0,
    durationInFrames,
  } = config;

  const springValue = spring({
    frame: frame - delay,
    fps,
    config: SPRING_CONFIGS.smooth,
    durationInFrames,
  });

  const scale = interpolate(springValue, [0, 1], [startScale, endScale]);
  const translateX = interpolate(springValue, [0, 1], [startX, endX]);
  const translateY = interpolate(springValue, [0, 1], [startY, endY]);

  return {
    scale,
    translateX,
    translateY,
    transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
  };
}

// Preset camera movements
export function useZoomIn(delay = 0, scale = 1.1): CameraTransform {
  return useCamera({
    startScale: 1,
    endScale: scale,
    delay,
  });
}

export function useZoomOut(delay = 0, startScale = 1.1): CameraTransform {
  return useCamera({
    startScale,
    endScale: 1,
    delay,
  });
}

export function usePanRight(delay = 0, distance = 50): CameraTransform {
  return useCamera({
    startX: 0,
    endX: -distance,
    delay,
  });
}

export function usePanLeft(delay = 0, distance = 50): CameraTransform {
  return useCamera({
    startX: 0,
    endX: distance,
    delay,
  });
}
