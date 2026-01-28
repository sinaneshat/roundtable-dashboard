/**
 * Camera Flythrough Tunnel Effect
 *
 * 3D tunnel/warp effect with the camera flying through for dramatic transitions.
 * Uses @remotion/three with react-three-fiber for WebGL rendering.
 *
 * Features:
 * - Torus rings forming a tunnel structure
 * - Speed lines for motion blur effect
 * - Camera movement through the tunnel
 * - Configurable colors, duration, and intensity
 */

import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import { useEffect, useMemo } from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';

import { BRAND, HEX_COLORS } from '../lib/design-tokens';

// ============================================================================
// Types
// ============================================================================

type CameraFlythroughProps = {
  /** Frame at which the animation starts (default: 0) */
  startFrame?: number;
  /** Duration of the flythrough in frames (default: 30) */
  duration?: number;
  /** Length of the tunnel in 3D units (default: 50) */
  tunnelLength?: number;
  /** Number of rings in the tunnel (default: 20) */
  ringCount?: number;
  /** Number of speed lines (default: 50) */
  speedLineCount?: number;
  /** Use brand rainbow colors (default: true) */
  useRainbowColors?: boolean;
  /** Base color if not using rainbow (default: primary) */
  baseColor?: string;
  /** Ring thickness (default: 0.05) */
  ringThickness?: number;
  /** Ring radius (default: 3) */
  ringRadius?: number;
  /** Camera field of view (default: 90) */
  fov?: number;
  /** Opacity multiplier (default: 1) */
  opacity?: number;
};

// ============================================================================
// Ring Data Generator
// ============================================================================

type RingData = {
  z: number;
  rotation: number;
  hue: number;
  colorIndex: number;
};

function generateRings(ringCount: number, tunnelLength: number): RingData[] {
  return Array.from({ length: ringCount }, (_, i) => ({
    z: -i * (tunnelLength / ringCount),
    rotation: i * 0.3,
    hue: (i * 15) % 360,
    colorIndex: i % BRAND.logoGradient.length,
  }));
}

// ============================================================================
// Speed Line Data Generator
// ============================================================================

type SpeedLineData = {
  x: number;
  y: number;
  length: number;
  speed: number;
  colorIndex: number;
};

function generateSpeedLines(count: number): SpeedLineData[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const distance = 1 + Math.random() * 4;
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      length: 2 + Math.random() * 3,
      speed: 0.5 + Math.random() * 0.5,
      colorIndex: i % BRAND.logoGradient.length,
    };
  });
}

// ============================================================================
// Camera Controller Component
// ============================================================================

type CameraControllerProps = {
  z: number;
  fov: number;
};

function CameraController({ z, fov }: CameraControllerProps) {
  const { camera, invalidate } = useThree();
  const frame = useCurrentFrame();

  useEffect(() => {
    camera.position.set(0, 0, 5 + z);
    camera.lookAt(0, 0, z - 10);

    // Update FOV if camera is PerspectiveCamera
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    invalidate();
  }, [camera, z, fov, invalidate, frame]);

  return null;
}

// ============================================================================
// Tunnel Ring Component
// ============================================================================

type TunnelRingProps = {
  ring: RingData;
  cameraZ: number;
  frame: number;
  ringRadius: number;
  ringThickness: number;
  useRainbowColors: boolean;
  baseColor: string;
  opacity: number;
};

function TunnelRing({
  ring,
  cameraZ,
  frame,
  ringRadius,
  ringThickness,
  useRainbowColors,
  baseColor,
  opacity,
}: TunnelRingProps) {
  // Calculate ring progress relative to camera
  const ringProgress = Math.max(0, (cameraZ - ring.z + 10) / 20);
  const scale = 1 + ringProgress * 2;
  const ringOpacity = Math.max(0, (1 - ringProgress) * opacity);

  // Skip rendering if completely transparent
  if (ringOpacity <= 0) {
    return null;
  }

  const color = useRainbowColors
    ? BRAND.logoGradient[ring.colorIndex]
    : baseColor;

  return (
    <mesh
      position={[0, 0, ring.z]}
      rotation={[0, 0, ring.rotation + frame * 0.02]}
      scale={[scale, scale, scale]}
    >
      <torusGeometry args={[ringRadius, ringThickness, 8, 32]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={ringOpacity}
      />
    </mesh>
  );
}

// ============================================================================
// Speed Line Component
// ============================================================================

type SpeedLineProps = {
  line: SpeedLineData;
  cameraZ: number;
  frame: number;
  tunnelLength: number;
  useRainbowColors: boolean;
  baseColor: string;
  opacity: number;
};

function SpeedLine({
  line,
  cameraZ,
  frame,
  tunnelLength,
  useRainbowColors,
  baseColor,
  opacity,
}: SpeedLineProps) {
  // Animate line position along z-axis
  const baseZ = ((frame * line.speed * 2) % tunnelLength) - tunnelLength / 2;
  const z = baseZ + cameraZ;

  // Distance-based opacity
  const distanceFromCamera = Math.abs(z - cameraZ);
  const lineOpacity = interpolate(
    distanceFromCamera,
    [0, 5, tunnelLength / 2],
    [0.8, 0.4, 0],
    { extrapolateRight: 'clamp' },
  ) * opacity;

  // Skip rendering if too faint
  if (lineOpacity <= 0.01) {
    return null;
  }

  const color = useRainbowColors
    ? BRAND.logoGradient[line.colorIndex]
    : baseColor;

  return (
    <mesh position={[line.x, line.y, z]}>
      <boxGeometry args={[0.02, 0.02, line.length]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={lineOpacity}
      />
    </mesh>
  );
}

// ============================================================================
// 3D Scene Content
// ============================================================================

type Scene3DContentProps = {
  cameraZ: number;
  rings: RingData[];
  speedLines: SpeedLineData[];
  ringRadius: number;
  ringThickness: number;
  tunnelLength: number;
  useRainbowColors: boolean;
  baseColor: string;
  opacity: number;
  fov: number;
};

function Scene3DContent({
  cameraZ,
  rings,
  speedLines,
  ringRadius,
  ringThickness,
  tunnelLength,
  useRainbowColors,
  baseColor,
  opacity,
  fov,
}: Scene3DContentProps) {
  const frame = useCurrentFrame();

  return (
    <>
      {/* Camera controller */}
      <CameraController z={cameraZ} fov={fov} />

      {/* Minimal ambient lighting */}
      <ambientLight intensity={0.2} />

      {/* Tunnel rings */}
      {rings.map((ring, i) => (
        <TunnelRing
          key={`ring-${i}`}
          ring={ring}
          cameraZ={cameraZ}
          frame={frame}
          ringRadius={ringRadius}
          ringThickness={ringThickness}
          useRainbowColors={useRainbowColors}
          baseColor={baseColor}
          opacity={opacity}
        />
      ))}

      {/* Speed lines */}
      {speedLines.map((line, i) => (
        <SpeedLine
          key={`line-${i}`}
          line={line}
          cameraZ={cameraZ}
          frame={frame}
          tunnelLength={tunnelLength}
          useRainbowColors={useRainbowColors}
          baseColor={baseColor}
          opacity={opacity}
        />
      ))}

      {/* Central glow */}
      <mesh position={[0, 0, cameraZ - 15]}>
        <circleGeometry args={[2, 32]} />
        <meshBasicMaterial
          color={useRainbowColors ? BRAND.colors.primary : baseColor}
          transparent
          opacity={0.15 * opacity}
        />
      </mesh>
    </>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function CameraFlythrough({
  startFrame = 0,
  duration = 30,
  tunnelLength = 50,
  ringCount = 20,
  speedLineCount = 50,
  useRainbowColors = true,
  baseColor = HEX_COLORS.primary,
  ringThickness = 0.05,
  ringRadius = 3,
  fov = 90,
  opacity = 1,
}: CameraFlythroughProps) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Calculate local frame and progress
  const localFrame = frame - startFrame;
  const progress = Math.max(0, Math.min(1, localFrame / duration));

  // Camera moves through tunnel
  const cameraZ = interpolate(progress, [0, 1], [0, -tunnelLength]);

  // Generate static ring and speed line data
  const rings = useMemo(
    () => generateRings(ringCount, tunnelLength),
    [ringCount, tunnelLength],
  );

  const speedLines = useMemo(
    () => generateSpeedLines(speedLineCount),
    [speedLineCount],
  );

  // Fade in/out at edges
  const fadeOpacity = interpolate(
    progress,
    [0, 0.1, 0.9, 1],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Don't render if outside active range
  if (localFrame < 0 || localFrame > duration) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity: fadeOpacity,
      }}
    >
      <ThreeCanvas
        width={width}
        height={height}
        camera={{
          fov,
          position: [0, 0, 5],
          near: 0.1,
          far: 200,
        }}
        style={{
          width: '100%',
          height: '100%',
        }}
      >
        <Scene3DContent
          cameraZ={cameraZ}
          rings={rings}
          speedLines={speedLines}
          ringRadius={ringRadius}
          ringThickness={ringThickness}
          tunnelLength={tunnelLength}
          useRainbowColors={useRainbowColors}
          baseColor={baseColor}
          opacity={opacity}
          fov={fov}
        />
      </ThreeCanvas>
    </div>
  );
}

// ============================================================================
// Preset Configurations
// ============================================================================

export const FLYTHROUGH_PRESETS = {
  /** Fast warp transition */
  warp: {
    duration: 20,
    tunnelLength: 60,
    ringCount: 25,
    speedLineCount: 80,
    fov: 120,
  },
  /** Smooth cinematic tunnel */
  cinematic: {
    duration: 45,
    tunnelLength: 40,
    ringCount: 15,
    speedLineCount: 40,
    fov: 75,
  },
  /** Subtle transition effect */
  subtle: {
    duration: 30,
    tunnelLength: 30,
    ringCount: 12,
    speedLineCount: 30,
    fov: 60,
    opacity: 0.6,
  },
  /** Intense hyperspace jump */
  hyperspace: {
    duration: 15,
    tunnelLength: 100,
    ringCount: 40,
    speedLineCount: 100,
    fov: 140,
  },
} as const;

export type FlythroughPreset = keyof typeof FLYTHROUGH_PRESETS;
