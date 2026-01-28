/**
 * 3D Browser Mockup Component
 *
 * Renders a 3D browser mockup using ThreeCanvas with:
 * - Rounded box mesh for browser frame
 * - Screen plane for content rendering
 * - Spring entrance animation with full spin
 * - Constant slow rotation
 * - Proper lighting setup
 *
 * IMPORTANT: Uses useCurrentFrame() for ALL animations, NOT useFrame() from R3F.
 */

import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Group } from 'three';
import * as THREE from 'three';

import { HEX_COLORS } from '../lib/design-tokens';

// ============================================================================
// Types
// ============================================================================

type Browser3DMeshProps = {
  /** Content to render on the browser screen (2D overlay) */
  children?: ReactNode;
  /** Browser frame color (hex) */
  color?: string;
  /** Screen color when no content (hex) */
  screenColor?: string;
  /** Rotation speed multiplier (default: 1) */
  rotationSpeed?: number;
  /** Delay before entrance animation starts (in frames) */
  entranceDelay?: number;
  /** Camera distance from origin */
  cameraDistance?: number;
};

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CAMERA_DISTANCE = 5;
const BROWSER_ASPECT = 16 / 10; // Browser aspect ratio
const BROWSER_WIDTH = 3.5;
const BROWSER_HEIGHT = BROWSER_WIDTH / BROWSER_ASPECT;
const BROWSER_DEPTH = 0.15;
const BROWSER_RADIUS = 0.08;
const SCREEN_INSET = 0.08;
const TOOLBAR_HEIGHT = 0.2;

// ============================================================================
// Rounded Box Geometry Helper
// Creates a box with rounded edges using beveled corners
// ============================================================================

function createRoundedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius: number,
  segments = 4,
): THREE.BufferGeometry {
  // Use ExtrudeGeometry with a rounded rectangle shape
  const shape = new THREE.Shape();

  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, Math.min(w, h));

  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth,
    bevelEnabled: true,
    bevelThickness: radius * 0.3,
    bevelSize: radius * 0.3,
    bevelSegments: segments,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geometry.center();

  return geometry;
}

// ============================================================================
// Animated Camera Component
// ============================================================================

function AnimatedCamera({ distance }: { distance: number }) {
  const frame = useCurrentFrame();
  const { camera, invalidate } = useThree();

  useEffect(() => {
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [frame, camera, distance, invalidate]);

  return null;
}

// ============================================================================
// Browser 3D Mesh Content
// ============================================================================

type BrowserMeshContentProps = {
  color: string;
  screenColor: string;
  rotationSpeed: number;
  entranceDelay: number;
};

function BrowserMeshContent({
  color,
  screenColor,
  rotationSpeed,
  entranceDelay,
}: BrowserMeshContentProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const groupRef = useRef<Group>(null);
  const { invalidate } = useThree();

  // Create geometries once with useMemo
  const browserGeometry = useMemo(
    () => createRoundedBoxGeometry(BROWSER_WIDTH, BROWSER_HEIGHT, BROWSER_DEPTH, BROWSER_RADIUS),
    [],
  );

  // Calculate animation values
  const entranceFrame = Math.max(0, frame - entranceDelay);

  // Spring entrance animation with full spin
  const entranceProgress = spring({
    frame: entranceFrame,
    fps,
    config: { damping: 200, mass: 3 },
    durationInFrames: 60,
  });

  // Scale from 0 to 1
  const scale = interpolate(entranceProgress, [0, 1], [0, 1]);

  // Entrance spin: full rotation from -PI to PI
  const entranceRotation = interpolate(entranceProgress, [0, 1], [-Math.PI, Math.PI]);

  // Constant rotation (slower than phone: Math.PI * 2 over duration)
  const constantRotation = interpolate(
    frame,
    [0, durationInFrames],
    [0, Math.PI * 2 * rotationSpeed],
  );

  // Combined Y rotation
  const rotateY = entranceRotation + constantRotation;

  // Entrance Y translation (float up from below)
  const translateY = interpolate(entranceProgress, [0, 1], [-4, 0]);

  // Subtle floating animation
  const floatY = Math.sin(frame * 0.05) * 0.05;

  // Force re-render on each frame
  useEffect(() => {
    invalidate();
  }, [frame, invalidate]);

  // Screen dimensions (inset from browser frame)
  const screenWidth = BROWSER_WIDTH - SCREEN_INSET * 2;
  const screenHeight = BROWSER_HEIGHT - SCREEN_INSET * 2 - TOOLBAR_HEIGHT;

  return (
    <group
      ref={groupRef}
      scale={[scale, scale, scale]}
      rotation={[0, rotateY, 0]}
      position={[0, translateY + floatY, 0]}
    >
      {/* Browser frame - main body */}
      <mesh
        geometry={browserGeometry}
        castShadow
        receiveShadow
      >
        <meshPhongMaterial
          color={color}
          shininess={30}
          specular="#444444"
        />
      </mesh>

      {/* Screen plane - positioned on front face */}
      <mesh position={[0, -TOOLBAR_HEIGHT / 2, BROWSER_DEPTH / 2 + 0.01]}>
        <planeGeometry args={[screenWidth, screenHeight]} />
        <meshBasicMaterial color={screenColor} />
      </mesh>

      {/* Toolbar area - slightly lighter */}
      <mesh position={[0, BROWSER_HEIGHT / 2 - TOOLBAR_HEIGHT / 2 - SCREEN_INSET, BROWSER_DEPTH / 2 + 0.01]}>
        <planeGeometry args={[screenWidth, TOOLBAR_HEIGHT - 0.02]} />
        <meshBasicMaterial color={HEX_COLORS.muted} />
      </mesh>

      {/* Address bar */}
      <mesh position={[0, BROWSER_HEIGHT / 2 - TOOLBAR_HEIGHT / 2 - SCREEN_INSET, BROWSER_DEPTH / 2 + 0.02]}>
        <planeGeometry args={[screenWidth * 0.7, TOOLBAR_HEIGHT * 0.4]} />
        <meshBasicMaterial color={HEX_COLORS.secondary} />
      </mesh>

      {/* Traffic lights (left side) */}
      {['#ff5f57', '#febc2e', '#28c840'].map((lightColor, i) => (
        <mesh
          key={lightColor}
          position={[-screenWidth / 2 + 0.15 + i * 0.12, BROWSER_HEIGHT / 2 - TOOLBAR_HEIGHT / 2 - SCREEN_INSET, BROWSER_DEPTH / 2 + 0.02]}
        >
          <circleGeometry args={[0.035, 16]} />
          <meshBasicMaterial color={lightColor} />
        </mesh>
      ))}

      {/* Frame edge highlight (top) */}
      <mesh position={[0, BROWSER_HEIGHT / 2 + 0.01, 0]}>
        <boxGeometry args={[BROWSER_WIDTH * 0.9, 0.01, BROWSER_DEPTH * 0.8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.1} />
      </mesh>
    </group>
  );
}

// ============================================================================
// Scene Content (Lighting + Mesh)
// ============================================================================

type SceneContentProps = {
  color: string;
  screenColor: string;
  rotationSpeed: number;
  entranceDelay: number;
  cameraDistance: number;
};

function SceneContent({
  color,
  screenColor,
  rotationSpeed,
  entranceDelay,
  cameraDistance,
}: SceneContentProps) {
  return (
    <>
      {/* Animated camera */}
      <AnimatedCamera distance={cameraDistance} />

      {/* Lighting setup */}
      <ambientLight intensity={0.5} />
      <pointLight
        position={[5, 5, 5]}
        intensity={1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight
        position={[-3, 3, 5]}
        intensity={0.8}
        castShadow
      />
      <directionalLight
        position={[3, -2, 2]}
        intensity={0.3}
        color="#ffffff"
      />

      {/* Browser mesh */}
      <BrowserMeshContent
        color={color}
        screenColor={screenColor}
        rotationSpeed={rotationSpeed}
        entranceDelay={entranceDelay}
      />
    </>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function Browser3DMesh({
  children,
  color = HEX_COLORS.card,
  screenColor = HEX_COLORS.background,
  rotationSpeed = 1,
  entranceDelay = 0,
  cameraDistance = DEFAULT_CAMERA_DISTANCE,
}: Browser3DMeshProps) {
  const { width, height } = useVideoConfig();

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* 3D Canvas */}
      <ThreeCanvas
        width={width}
        height={height}
        camera={{
          fov: 50,
          position: [0, 0, cameraDistance],
          near: 0.1,
          far: 100,
        }}
        style={{
          width: '100%',
          height: '100%',
        }}
      >
        <SceneContent
          color={color}
          screenColor={screenColor}
          rotationSpeed={rotationSpeed}
          entranceDelay={entranceDelay}
          cameraDistance={cameraDistance}
        />
      </ThreeCanvas>

      {/* 2D Content overlay (renders on top of 3D canvas) */}
      {children && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Preset Configurations
// ============================================================================

export const BROWSER_3D_PRESETS = {
  /** Slow gentle rotation */
  gentle: { rotationSpeed: 0.5, entranceDelay: 0 },
  /** Standard rotation speed */
  standard: { rotationSpeed: 1, entranceDelay: 0 },
  /** Faster showcase rotation */
  showcase: { rotationSpeed: 1.5, entranceDelay: 0 },
  /** Delayed entrance for sequenced animations */
  delayed: { rotationSpeed: 1, entranceDelay: 30 },
  /** Very slow, cinematic rotation */
  cinematic: { rotationSpeed: 0.3, entranceDelay: 15 },
} as const;

export type Browser3DPreset = keyof typeof BROWSER_3D_PRESETS;
