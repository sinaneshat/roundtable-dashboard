/**
 * DepthOfField - CSS-based depth blur effect for cinematic DOF simulation
 *
 * Creates a layered depth-of-field effect where content at different
 * depth planes receives varying amounts of blur based on distance
 * from the focus plane.
 */

import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

type DepthLayer = {
  content: ReactNode;
  /** Depth value 0-1, where 0 = closest to camera, 1 = furthest */
  depth: number;
};

type DepthOfFieldProps = {
  children?: ReactNode;
  /** Focus plane position 0-1 */
  focusDistance: number;
  /** Blur intensity multiplier (1-20, higher = more blur) */
  aperture: number;
  /** Content layers at different depths */
  layers: DepthLayer[];
  /** Enable subtle focus breathing animation */
  enableBreathing?: boolean;
  /** Breathing animation speed (lower = slower) */
  breathingSpeed?: number;
  /** Breathing animation amplitude */
  breathingAmplitude?: number;
};

export function DepthOfField({
  layers,
  focusDistance,
  aperture,
  enableBreathing = true,
  breathingSpeed = 0.02,
  breathingAmplitude = 0.1,
}: DepthOfFieldProps) {
  const frame = useCurrentFrame();

  // Animate focus point with subtle breathing
  const focusBreathing = enableBreathing
    ? Math.sin(frame * breathingSpeed) * breathingAmplitude
    : 0;
  const animatedFocus = Math.max(0, Math.min(1, focusDistance + focusBreathing));

  return (
    <AbsoluteFill>
      {layers.map((layer, i) => {
        // Calculate blur based on distance from focus plane
        const distanceFromFocus = Math.abs(layer.depth - animatedFocus);
        const blurAmount = distanceFromFocus * aperture;

        // Layers further from focus get slight scale (simulates lens optics)
        const scale = 1 + distanceFromFocus * 0.05;

        // Subtle opacity reduction for out-of-focus layers
        const opacity = interpolate(distanceFromFocus, [0, 0.5, 1], [1, 0.85, 0.7], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        // Z-index: closer objects (lower depth) should be on top
        const zIndex = Math.round((1 - layer.depth) * 100);

        const style: CSSProperties = {
          position: 'absolute',
          inset: 0,
          filter: blurAmount > 0.1 ? `blur(${blurAmount}px)` : undefined,
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          opacity,
          zIndex,
          willChange: 'filter, transform, opacity',
        };

        return (
          <div key={`depth-${layer.depth}-${i}`} style={style}>
            {layer.content}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

/**
 * Calculate depth layer properties based on scroll/animation offset
 */
export function getDepthLayers(scrollOffset: number) {
  const normalizedOffset = Math.max(0, Math.min(1, scrollOffset));

  return {
    /** Background layer - always blurred */
    far: {
      depth: 1,
      blur: 8 + normalizedOffset * 4,
      scale: 0.95,
      opacity: 0.5 + normalizedOffset * 0.2,
    },
    /** Middle layer - partially focused */
    mid: {
      depth: 0.5,
      blur: 2 + normalizedOffset * 2,
      scale: 1,
      opacity: 0.8 + normalizedOffset * 0.1,
    },
    /** Foreground layer - in focus */
    near: {
      depth: 0,
      blur: normalizedOffset * 2,
      scale: 1.05 - normalizedOffset * 0.05,
      opacity: 1,
    },
  };
}

/**
 * Single-layer DOF wrapper for simple use cases
 * Wraps content and applies blur based on distance from focus
 */
type DepthLayerWrapperProps = {
  children: ReactNode;
  depth: number;
  focusDistance: number;
  aperture: number;
  className?: string;
};

export function DepthLayerWrapper({
  children,
  depth,
  focusDistance,
  aperture,
  className,
}: DepthLayerWrapperProps) {
  const distanceFromFocus = Math.abs(depth - focusDistance);
  const blurAmount = distanceFromFocus * aperture;
  const scale = 1 + distanceFromFocus * 0.03;
  const opacity = interpolate(distanceFromFocus, [0, 0.5, 1], [1, 0.9, 0.75], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      className={className}
      style={{
        filter: blurAmount > 0.1 ? `blur(${blurAmount}px)` : undefined,
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        opacity,
        willChange: 'filter, transform, opacity',
      }}
    >
      {children}
    </div>
  );
}

/**
 * Animated focus transition - smoothly transitions focus between depth layers
 * Must be called from within a Remotion composition (uses useCurrentFrame)
 */
export function useAnimatedFocus({
  startFocus,
  endFocus,
  startFrame,
  durationFrames,
}: {
  startFocus: number;
  endFocus: number;
  startFrame: number;
  durationFrames: number;
}) {
  const frame = useCurrentFrame();

  const focus = interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [startFocus, endFocus],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );

  const isAnimating = frame >= startFrame && frame <= startFrame + durationFrames;

  return { focus, isAnimating };
}

/**
 * Rack focus effect - dramatic focus shift between layers
 */
type RackFocusProps = {
  children?: ReactNode;
  layers: DepthLayer[];
  /** Starting focus depth */
  fromDepth: number;
  /** Ending focus depth */
  toDepth: number;
  /** Frame when rack focus begins */
  startFrame: number;
  /** Duration of focus shift in frames */
  durationFrames: number;
  /** Blur intensity */
  aperture?: number;
};

export function RackFocus({
  layers,
  fromDepth,
  toDepth,
  startFrame,
  durationFrames,
  aperture = 12,
}: RackFocusProps) {
  const { focus } = useAnimatedFocus({
    startFocus: fromDepth,
    endFocus: toDepth,
    startFrame,
    durationFrames,
  });

  return (
    <DepthOfField
      layers={layers}
      focusDistance={focus}
      aperture={aperture}
      enableBreathing={false}
    />
  );
}

/**
 * Bokeh overlay - adds bokeh-style blur circles for out-of-focus lights
 */
type BokehOverlayProps = {
  /** Intensity of bokeh effect (0-1) */
  intensity: number;
  /** Number of bokeh circles */
  count?: number;
  /** Random seed for consistent positioning */
  seed?: number;
};

export function BokehOverlay({ intensity, count = 12, seed = 42 }: BokehOverlayProps) {
  const frame = useCurrentFrame();

  if (intensity <= 0) {
    return null;
  }

  // Seeded random for consistent bokeh positions
  const seededRandom = (n: number) => {
    const x = Math.sin(seed + n * 9.8) * 10000;
    return x - Math.floor(x);
  };

  const bokehCircles = Array.from({ length: count }, (_, i) => {
    const x = seededRandom(i) * 100;
    const y = seededRandom(i + 100) * 100;
    const size = 20 + seededRandom(i + 200) * 60;
    const hue = seededRandom(i + 300) * 60 + 30; // warm tones
    const drift = Math.sin(frame * 0.01 + i) * 2;

    return (
      <div
        key={`bokeh-${seed}-${i}`}
        style={{
          position: 'absolute',
          left: `${x}%`,
          top: `${y}%`,
          width: size,
          height: size,
          borderRadius: '50%',
          background: `radial-gradient(circle, hsla(${hue}, 50%, 70%, ${intensity * 0.3}) 0%, transparent 70%)`,
          transform: `translate(-50%, -50%) translate(${drift}px, ${drift * 0.5}px)`,
          filter: `blur(${size * 0.3}px)`,
          pointerEvents: 'none',
        }}
      />
    );
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 50 }}>{bokehCircles}</AbsoluteFill>
  );
}
