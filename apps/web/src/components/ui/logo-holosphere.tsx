'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, useState, useEffect } from 'react';
import * as THREE from 'three';

import { cn } from '@/lib/ui/cn';

const vertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(cameraPosition - vWorldPos);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float time;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  vec3 hash3(vec3 p) {
    p = vec3(
      dot(p, vec3(127.1, 311.7, 74.7)),
      dot(p, vec3(269.5, 183.3, 246.1)),
      dot(p, vec3(113.5, 271.9, 124.6))
    );
    return fract(sin(p) * 43758.5453);
  }

  float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(
        mix(dot(hash3(i), f),
            dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), f.x),
        mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)),
            dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), f.x),
        f.y),
      mix(
        mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)),
            dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), f.x),
        mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)),
            dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), f.x),
        f.y),
      f.z) + 0.5;
  }

  float fbm3D(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise3D(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  // Logo colors extracted from actual logo.png - arranged to match visual appearance
  // Starting from LEFT and going CLOCKWISE as seen in the logo
  vec3 logoColor(float t) {
    t = fract(t);

    // Colors arranged to match logo appearance (left → top → right → bottom → back to left)
    vec3 c0 = vec3(1.000, 0.800, 0.000);  // Gold/Yellow (LEFT edge)
    vec3 c1 = vec3(1.000, 0.600, 0.000);  // Orange (upper-left)
    vec3 c2 = vec3(1.000, 0.400, 0.200);  // Orange-Pink
    vec3 c3 = vec3(1.000, 0.200, 0.500);  // Pink/Magenta (TOP)
    vec3 c4 = vec3(0.800, 0.100, 0.600);  // Magenta-Purple
    vec3 c5 = vec3(0.550, 0.100, 0.700);  // Purple (upper-right)
    vec3 c6 = vec3(0.350, 0.150, 0.750);  // Deep Purple/Indigo
    vec3 c7 = vec3(0.200, 0.300, 0.800);  // Indigo-Blue (RIGHT)
    vec3 c8 = vec3(0.100, 0.500, 0.900);  // Blue
    vec3 c9 = vec3(0.000, 0.700, 0.850);  // Cyan (lower-right)
    vec3 c10 = vec3(0.000, 0.600, 0.600); // Teal (BOTTOM)
    vec3 c11 = vec3(0.200, 0.700, 0.400); // Green (lower-left)
    vec3 c12 = vec3(0.500, 0.800, 0.300); // Lime-Green
    vec3 c13 = vec3(0.750, 0.850, 0.200); // Yellow-Lime (back to left)

    // 14 color stops for smoother transition
    float idx = t * 14.0;
    float f = fract(idx);
    f = f * f * (3.0 - 2.0 * f);
    int i = int(floor(idx));

    if (i == 0) return mix(c0, c1, f);
    if (i == 1) return mix(c1, c2, f);
    if (i == 2) return mix(c2, c3, f);
    if (i == 3) return mix(c3, c4, f);
    if (i == 4) return mix(c4, c5, f);
    if (i == 5) return mix(c5, c6, f);
    if (i == 6) return mix(c6, c7, f);
    if (i == 7) return mix(c7, c8, f);
    if (i == 8) return mix(c8, c9, f);
    if (i == 9) return mix(c9, c10, f);
    if (i == 10) return mix(c10, c11, f);
    if (i == 11) return mix(c11, c12, f);
    if (i == 12) return mix(c12, c13, f);
    return mix(c13, c0, f);
  }

  void main() {
    vec3 dir = normalize(vWorldPos);
    float t = time * 0.03;

    // Calculate angle - adjusted so gold starts on LEFT when viewed from front
    // atan(x, z) gives angle in XZ plane, we offset to align with logo
    float baseAngle = atan(dir.x, -dir.z) / 6.28318 + 0.5;

    // Add vertical influence for more logo-like appearance
    float verticalBlend = dir.y * 0.15;

    float warp = fbm3D(dir * 2.0 + t * 0.3) * 0.06;
    float colorPos = baseAngle + warp + verticalBlend + t * 0.04;

    vec3 color = logoColor(colorPos);

    float depthNoise = fbm3D(dir * 3.0 - t * 0.2 + vec3(50.0)) * 0.06;
    vec3 color2 = logoColor(colorPos + depthNoise + 0.1);
    color = mix(color, color2, 0.2);

    float fresnel = pow(1.0 - max(dot(vViewDir, vNormal), 0.0), 2.5);
    vec3 rimColor = logoColor(colorPos + 0.2);
    rimColor = mix(rimColor, vec3(1.0), 0.2);
    color = mix(color, rimColor, fresnel * 0.35);

    color *= 1.0 + (1.0 - fresnel) * 0.08;
    color *= 1.0 + sin(time * 0.25) * 0.01;

    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(lum), color, 1.1);

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;

function CameraSetup() {
  const { camera, gl } = useThree();

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    }
    gl.setClearColor(0x000000, 0);
  }, [camera, gl]);

  return null;
}

function Planet() {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => ({
    time: { value: 0 }
  }), []);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();

    if (materialRef.current?.uniforms.time) {
      materialRef.current.uniforms.time.value = elapsed;
    }

    if (meshRef.current) {
      meshRef.current.rotation.y = elapsed * 0.04;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 128, 128]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </mesh>
  );
}

type LogoHolosphereProps = {
  className?: string;
  width?: number;
  height?: number;
};

export function LogoHolosphere({
  className,
  width = 128,
  height = 128,
}: LogoHolosphereProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const size = Math.max(width, height);
  const glowSize = size * 1.5;

  if (!ready) {
    return (
      <div
        className={cn('rounded-full', className)}
        style={{
          width: size,
          height: size,
          background: 'conic-gradient(from 270deg, #FFCC00, #FF9900, #FF6633, #FF3380, #CC1A99, #8C1AB3, #5926BF, #334DCC, #1A80E6, #00B3D9, #009999, #33B366, #80CC4D, #BFD933, #FFCC00)',
        }}
      />
    );
  }

  return (
    <div
      className={cn('relative', className)}
      style={{
        width: glowSize,
        height: glowSize,
      }}
    >
      {/* Glow effect - positioned absolutely behind */}
      <div
        className="absolute rounded-full blur-2xl"
        style={{
          width: glowSize,
          height: glowSize,
          left: 0,
          top: 0,
          opacity: 0.4,
          background: 'conic-gradient(from 270deg, #FFCC00, #FF9900, #FF6633, #FF3380, #CC1A99, #8C1AB3, #5926BF, #334DCC, #1A80E6, #00B3D9, #009999, #33B366, #80CC4D, #BFD933, #FFCC00)',
          pointerEvents: 'none',
        }}
      />

      {/* Canvas container - centered */}
      <div
        style={{
          position: 'absolute',
          width: size,
          height: size,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          overflow: 'hidden',
        }}
      >
        <Canvas
          camera={{
            position: [0, 0, 3],
            fov: 40,
            near: 0.1,
            far: 100
          }}
          dpr={[1, 2]}
          gl={{
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance'
          }}
          style={{
            width: '100%',
            height: '100%',
          }}
        >
          <CameraSetup />
          <Planet />
        </Canvas>
      </div>
    </div>
  );
}
