/**
 * ChromaticAberration - Enhanced RGB shift effect for transitions
 *
 * Creates a cinematic chromatic aberration effect at transition peaks
 * with separated RGB channels that shift in opposite directions.
 */

import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

type ChromaticAberrationProps = {
  /** Frame numbers where transitions occur */
  transitionFrames: number[];
  /** Maximum RGB shift in pixels at peak */
  maxShift?: number;
  /** Duration of effect in frames (before and after transition frame) */
  duration?: number;
  /** Base opacity at peak */
  baseOpacity?: number;
};

export function ChromaticAberration({
  transitionFrames,
  maxShift = 6,
  duration = 12,
  baseOpacity = 0.15,
}: ChromaticAberrationProps) {
  const frame = useCurrentFrame();

  // Calculate RGB shift based on proximity to transition frames
  const { rgbShift, peakIntensity } = transitionFrames.reduce(
    (acc, transFrame) => {
      const dist = Math.abs(frame - transFrame);
      if (dist < duration) {
        const intensity = interpolate(dist, [0, duration], [1, 0], {
          extrapolateRight: 'clamp',
        });
        if (intensity > acc.peakIntensity) {
          return {
            rgbShift: intensity * maxShift,
            peakIntensity: intensity,
          };
        }
      }
      return acc;
    },
    { rgbShift: 0, peakIntensity: 0 },
  );

  // Early return if no effect needed
  if (peakIntensity <= 0) {
    return null;
  }

  const opacity = peakIntensity * baseOpacity;

  return (
    <>
      {/* Red channel - shifts left */}
      <AbsoluteFill
        style={{
          backgroundColor: 'transparent',
          boxShadow: `inset ${-rgbShift}px 0 ${rgbShift * 2}px rgba(255, 0, 0, ${opacity})`,
          zIndex: 1001,
          pointerEvents: 'none',
          mixBlendMode: 'screen',
        }}
      />

      {/* Cyan channel - shifts right */}
      <AbsoluteFill
        style={{
          backgroundColor: 'transparent',
          boxShadow: `inset ${rgbShift}px 0 ${rgbShift * 2}px rgba(0, 255, 255, ${opacity})`,
          zIndex: 1002,
          pointerEvents: 'none',
          mixBlendMode: 'screen',
        }}
      />

      {/* Central glow at peak */}
      {peakIntensity > 0.5 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at center, rgba(255, 255, 255, ${(peakIntensity - 0.5) * 0.15}) 0%, transparent 50%)`,
            zIndex: 1003,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Scanline effect at peak for extra grit */}
      {peakIntensity > 0.7 && (
        <AbsoluteFill
          style={{
            background: `repeating-linear-gradient(
              0deg,
              transparent 0px,
              transparent 2px,
              rgba(0, 0, 0, ${(peakIntensity - 0.7) * 0.1}) 2px,
              rgba(0, 0, 0, ${(peakIntensity - 0.7) * 0.1}) 4px
            )`,
            zIndex: 1004,
            pointerEvents: 'none',
          }}
        />
      )}
    </>
  );
}

/**
 * Calculate chromatic aberration values for use in other components
 */
export function useChromaticAberration(
  transitionFrames: number[],
  maxShift = 6,
  duration = 12,
) {
  const frame = useCurrentFrame();

  return transitionFrames.reduce(
    (acc, transFrame) => {
      const dist = Math.abs(frame - transFrame);
      if (dist < duration) {
        const intensity = interpolate(dist, [0, duration], [1, 0], {
          extrapolateRight: 'clamp',
        });
        if (intensity > acc.intensity) {
          return {
            shift: intensity * maxShift,
            intensity,
            isActive: true,
          };
        }
      }
      return acc;
    },
    { shift: 0, intensity: 0, isActive: false },
  );
}
