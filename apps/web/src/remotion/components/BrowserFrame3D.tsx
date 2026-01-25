/**
 * 3D Browser Frame Component
 *
 * Wraps BrowserFrame content with 3D perspective transforms for cinematic video effects.
 * Uses CSS 3D transforms with Remotion's animation system for smooth, frame-accurate animations.
 *
 * IMPORTANT: Uses useCurrentFrame() for all animations, NOT useFrame() from R3F.
 * This approach uses CSS transforms instead of WebGL for better DOM content rendering.
 */

import type { CSSProperties, ReactNode } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import { SPRINGS } from '../lib/design-tokens';

// ============================================================================
// Types
// ============================================================================

type BrowserFrame3DProps = {
  /** Content to render inside the 3D browser frame */
  children: ReactNode;
  /** Rotation around X axis in radians (pitch) */
  rotateX?: number;
  /** Rotation around Y axis in radians (yaw) */
  rotateY?: number;
  /** Rotation around Z axis in radians (roll) */
  rotateZ?: number;
  /** Camera/perspective distance in pixels (default: 1200) */
  cameraDistance?: number;
  /** Delay before entrance animation starts (in frames) */
  entranceDelay?: number;
  /** Enable depth blur effect on edges */
  depthBlur?: boolean;
  /** Custom style for the outer container */
  style?: CSSProperties;
  /** Custom style for the inner transform container */
  innerStyle?: CSSProperties;
};

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CAMERA_DISTANCE = 1200;

// Entrance animation config
const ENTRANCE_CONFIG = {
  initialScale: 0.92,
  finalScale: 1,
  initialRotateX: 0.06, // radians - subtle tilt back
  initialRotateY: -0.04, // radians - subtle rotation
  initialTranslateZ: -50, // pixels - slight depth
  durationFrames: 30,
} as const;

// Convert radians to degrees for CSS
const radToDeg = (rad: number): number => rad * (180 / Math.PI);

// ============================================================================
// Depth Blur Effect
// Creates a gradient overlay that simulates depth-of-field blur at edges
// ============================================================================

type DepthBlurOverlayProps = {
  rotateX: number;
  rotateY: number;
  enabled: boolean;
  entranceProgress: number;
};

function DepthBlurOverlay({ rotateX, rotateY, enabled, entranceProgress }: DepthBlurOverlayProps) {
  if (!enabled)
    return null;

  // Calculate blur parameters based on rotation
  const rotationMagnitude = Math.sqrt(rotateX ** 2 + rotateY ** 2);

  // Determine which edges need blur based on rotation direction
  const topBlur = rotateX > 0 ? Math.abs(rotateX) * 0.5 : 0;
  const bottomBlur = rotateX < 0 ? Math.abs(rotateX) * 0.5 : 0;
  const leftBlur = rotateY > 0 ? Math.abs(rotateY) * 0.4 : 0;
  const rightBlur = rotateY < 0 ? Math.abs(rotateY) * 0.4 : 0;

  // Overall blur intensity scales with rotation and entrance
  const blurIntensity = interpolate(
    rotationMagnitude * entranceProgress,
    [0, 0.4],
    [0, 1],
    { extrapolateRight: 'clamp' },
  );

  if (blurIntensity < 0.05)
    return null;

  // Create edge-specific gradients
  const overlayStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    borderRadius: 'inherit',
    zIndex: 10,
    overflow: 'hidden',
  };

  // Top edge blur
  const topGradient = topBlur > 0
    ? `linear-gradient(to bottom, rgba(0,0,0,${topBlur * 0.6}) 0%, transparent 15%)`
    : 'none';

  // Bottom edge blur
  const bottomGradient = bottomBlur > 0
    ? `linear-gradient(to top, rgba(0,0,0,${bottomBlur * 0.5}) 0%, transparent 12%)`
    : 'none';

  // Left edge blur
  const leftGradient = leftBlur > 0
    ? `linear-gradient(to right, rgba(0,0,0,${leftBlur * 0.5}) 0%, transparent 10%)`
    : 'none';

  // Right edge blur
  const rightGradient = rightBlur > 0
    ? `linear-gradient(to left, rgba(0,0,0,${rightBlur * 0.5}) 0%, transparent 10%)`
    : 'none';

  // Combine gradients
  const gradients = [topGradient, bottomGradient, leftGradient, rightGradient]
    .filter(g => g !== 'none')
    .join(', ');

  if (!gradients)
    return null;

  return (
    <div
      style={{
        ...overlayStyle,
        background: gradients,
        opacity: blurIntensity,
      }}
    />
  );
}

// ============================================================================
// Lighting Simulation
// Creates subtle lighting gradients to enhance 3D effect
// ============================================================================

type LightingOverlayProps = {
  rotateX: number;
  rotateY: number;
  entranceProgress: number;
};

function LightingOverlay({ rotateX, rotateY, entranceProgress }: LightingOverlayProps) {
  // Calculate light position based on rotation
  // Light comes from top-left by default
  const lightX = 30 + rotateY * -30; // Move light opposite to rotation
  const lightY = 20 + rotateX * -20;

  // Highlight intensity based on rotation
  const highlightIntensity = interpolate(
    Math.abs(rotateX) + Math.abs(rotateY),
    [0, 0.5],
    [0.02, 0.08],
    { extrapolateRight: 'clamp' },
  );

  // Shadow intensity on opposite side
  const shadowIntensity = interpolate(
    Math.abs(rotateX) + Math.abs(rotateY),
    [0, 0.5],
    [0, 0.15],
    { extrapolateRight: 'clamp' },
  );

  const overlayStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    borderRadius: 'inherit',
    background: `
      radial-gradient(
        ellipse 120% 80% at ${lightX}% ${lightY}%,
        rgba(255, 255, 255, ${highlightIntensity * entranceProgress}) 0%,
        transparent 50%
      ),
      radial-gradient(
        ellipse 120% 80% at ${100 - lightX}% ${100 - lightY}%,
        rgba(0, 0, 0, ${shadowIntensity * entranceProgress}) 0%,
        transparent 50%
      )
    `,
    zIndex: 5,
  };

  return <div style={overlayStyle} />;
}

// ============================================================================
// Main BrowserFrame3D Component
// ============================================================================

export function BrowserFrame3D({
  children,
  rotateX = 0,
  rotateY = 0,
  rotateZ = 0,
  cameraDistance = DEFAULT_CAMERA_DISTANCE,
  entranceDelay = 0,
  depthBlur = false,
  style,
  innerStyle,
}: BrowserFrame3DProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Calculate entrance animation progress
  const entranceFrame = Math.max(0, frame - entranceDelay);

  // Spring animation for entrance
  const entranceProgress = spring({
    frame: entranceFrame,
    fps,
    config: SPRINGS.cinematic,
    durationInFrames: ENTRANCE_CONFIG.durationFrames,
  });

  // Scale animation: 0.85 -> 1
  const scale = interpolate(
    entranceProgress,
    [0, 1],
    [ENTRANCE_CONFIG.initialScale, ENTRANCE_CONFIG.finalScale],
  );

  // Rotation entrance: animate from initial offset to target rotation
  const animatedRotateX = interpolate(
    entranceProgress,
    [0, 1],
    [rotateX + ENTRANCE_CONFIG.initialRotateX, rotateX],
  );

  const animatedRotateY = interpolate(
    entranceProgress,
    [0, 1],
    [rotateY + ENTRANCE_CONFIG.initialRotateY, rotateY],
  );

  // Z translation for depth during entrance
  const translateZ = interpolate(
    entranceProgress,
    [0, 1],
    [ENTRANCE_CONFIG.initialTranslateZ, 0],
  );

  // Opacity for entrance fade
  const opacity = interpolate(entranceProgress, [0, 0.4], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Convert radians to degrees for CSS transforms
  const rotateXDeg = radToDeg(animatedRotateX);
  const rotateYDeg = radToDeg(animatedRotateY);
  const rotateZDeg = radToDeg(rotateZ);

  // Outer container with perspective
  const containerStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    perspective: cameraDistance,
    perspectiveOrigin: '50% 50%',
    ...style,
  };

  // Inner transform container
  const transformStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    transformStyle: 'preserve-3d',
    transform: `
      translateZ(${translateZ}px)
      rotateX(${rotateXDeg}deg)
      rotateY(${rotateYDeg}deg)
      rotateZ(${rotateZDeg}deg)
      scale(${scale})
    `,
    opacity,
    willChange: 'transform, opacity',
    ...innerStyle,
  };

  // Content wrapper - centers and contains the browser frame
  const contentWrapperStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div style={containerStyle}>
      <div style={transformStyle}>
        <div style={contentWrapperStyle}>
          <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden' }}>
            {children}
            <LightingOverlay
              rotateX={animatedRotateX}
              rotateY={animatedRotateY}
              entranceProgress={entranceProgress}
            />
            <DepthBlurOverlay
              rotateX={animatedRotateX}
              rotateY={animatedRotateY}
              enabled={depthBlur}
              entranceProgress={entranceProgress}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Preset Configurations
// Common camera angles for easy use
// ============================================================================

export const CAMERA_PRESETS = {
  /** Front-facing, no rotation */
  front: { rotateX: 0, rotateY: 0, rotateZ: 0 },
  /** Very subtle tilt - barely noticeable depth */
  subtle: { rotateX: 0.01, rotateY: 0.015, rotateZ: 0 },
  /** Hero shot - gentle angle */
  hero: { rotateX: 0.02, rotateY: 0.025, rotateZ: -0.004 },
  /** Showcase angle - slightly more perspective */
  showcase: { rotateX: 0.025, rotateY: 0.03, rotateZ: -0.005 },
  /** Side view - subtle side emphasis */
  side: { rotateX: 0.01, rotateY: 0.04, rotateZ: 0 },
  /** Top-down angle - gentle downward look */
  topDown: { rotateX: 0.04, rotateY: 0, rotateZ: 0 },
  /** Isometric-ish view - balanced subtle angle */
  isometric: { rotateX: 0.02, rotateY: 0.02, rotateZ: 0 },
  /** Cinematic angle */
  cinematic: { rotateX: 0.015, rotateY: 0.035, rotateZ: -0.008 },
} as const;

export type CameraPreset = keyof typeof CAMERA_PRESETS;

// ============================================================================
// Helper function to apply preset
// ============================================================================

export function getPresetRotation(preset: CameraPreset) {
  return CAMERA_PRESETS[preset];
}
