'use client';

import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { cn } from '@/lib/ui/cn';

// Advanced vertex shader with displacement
const vertexShader = `
  uniform float u_time;
  uniform float u_distortionStrength;

  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying float vDisplacement;

  // 3D Simplex noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * snoise(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vUv = uv;
    vNormal = normal;

    // Multi-layered displacement for organic surface
    vec3 pos = position;
    float t = u_time * 0.3;

    // Large rolling waves
    float displacement1 = fbm(pos * 2.0 + t * 0.5) * 0.15;

    // Medium turbulence
    float displacement2 = fbm(pos * 4.0 - t * 0.3) * 0.08;

    // Fine detail
    float displacement3 = snoise(pos * 8.0 + t) * 0.03;

    // Pulsing effect
    float pulse = sin(u_time * 2.0) * 0.02;

    float totalDisplacement = (displacement1 + displacement2 + displacement3 + pulse) * u_distortionStrength;
    vDisplacement = totalDisplacement;

    pos += normal * totalDisplacement;
    vPosition = pos;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

// Advanced fragment shader with plasma color mixing
const fragmentShader = `
  uniform float u_time;
  uniform sampler2D u_texture;
  uniform float u_colorIntensity;
  uniform float u_glowStrength;

  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying float vDisplacement;

  #define PI 3.14159265359
  #define TAU 6.28318530718

  // Noise functions
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 6; i++) {
      value += amplitude * snoise(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  // Vibrant color palette
  vec3 palette(float t) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 1.0, 1.0);
    vec3 d = vec3(0.0, 0.33, 0.67);
    return a + b * cos(TAU * (c * t + d));
  }

  // Solar flare palette
  vec3 solarPalette(float t) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 0.7, 0.4);
    vec3 d = vec3(0.0, 0.15, 0.20);
    return a + b * cos(TAU * (c * t + d));
  }

  // Aurora palette
  vec3 auroraPalette(float t) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(2.0, 1.0, 0.0);
    vec3 d = vec3(0.5, 0.2, 0.25);
    return a + b * cos(TAU * (c * t + d));
  }

  void main() {
    float t = u_time * 0.4;
    float slowT = u_time * 0.15;

    // === DOMAIN WARPING FOR LIQUID EFFECT ===
    vec2 uv = vUv;
    vec3 pos3D = vPosition * 2.0;

    // Intense multi-layer warping
    float warp1 = fbm(pos3D + t * 0.3);
    float warp2 = fbm(pos3D + vec3(warp1 * 2.0) + t * 0.2);
    float warp3 = fbm(pos3D + vec3(warp2 * 2.0) - t * 0.25);

    vec2 warpedUV = uv + vec2(warp2, warp3) * 0.15;

    // === DRAMATIC CHROMATIC ABERRATION ===
    float chromaStrength = 0.04 + sin(t) * 0.02;
    float angle = atan(uv.y - 0.5, uv.x - 0.5);

    vec2 redOffset = vec2(cos(angle + t), sin(angle + t)) * chromaStrength;
    vec2 greenOffset = vec2(0.0);
    vec2 blueOffset = vec2(cos(angle + t + PI), sin(angle + t + PI)) * chromaStrength;

    // Sample texture with chromatic split
    vec4 texR = texture2D(u_texture, warpedUV + redOffset);
    vec4 texG = texture2D(u_texture, warpedUV + greenOffset);
    vec4 texB = texture2D(u_texture, warpedUV + blueOffset);

    vec3 texColor = vec3(texR.r, texG.g, texB.b);
    float alpha = max(max(texR.a, texG.a), texB.a);

    // === PLASMA COLOR GENERATION ===
    // Multiple overlapping plasma patterns
    float plasma1 = fbm(pos3D * 1.5 + t * 0.5);
    float plasma2 = fbm(pos3D * 2.5 + vec3(100.0) - t * 0.4);
    float plasma3 = sin(pos3D.x * 5.0 + t) * sin(pos3D.y * 5.0 + t * 1.3) * sin(pos3D.z * 5.0 - t * 0.7);

    float plasmaValue = (plasma1 + plasma2 * 0.6 + plasma3 * 0.4) * 0.5 + 0.5;
    plasmaValue += slowT * 0.2; // Animate through spectrum

    // Mix multiple palettes for rich colors
    vec3 color1 = palette(plasmaValue);
    vec3 color2 = solarPalette(plasmaValue + 0.3);
    vec3 color3 = auroraPalette(plasmaValue - 0.2);

    float mixFactor1 = fbm(pos3D * 0.8 + t * 0.1) * 0.5 + 0.5;
    float mixFactor2 = fbm(pos3D * 1.2 - t * 0.15) * 0.5 + 0.5;

    vec3 dynamicColor = mix(color1, color2, mixFactor1);
    dynamicColor = mix(dynamicColor, color3, mixFactor2 * 0.5);

    // === INTENSE COLOR BLENDING INTO TEXTURE ===
    float lum = dot(texColor, vec3(0.299, 0.587, 0.114));
    float colorInfluence = u_colorIntensity * (0.8 + sin(t * 0.5) * 0.2);

    // Color dodge blend for intensity
    vec3 colorDodge = texColor / (1.0 - dynamicColor * 0.6 + 0.001);

    // Overlay blend
    vec3 overlay = mix(
      2.0 * texColor * dynamicColor,
      1.0 - 2.0 * (1.0 - texColor) * (1.0 - dynamicColor),
      step(0.5, lum)
    );

    // Screen blend for brighter areas
    vec3 screen = 1.0 - (1.0 - texColor) * (1.0 - dynamicColor);

    // Combine blending modes based on luminance
    vec3 blendedColor = mix(overlay, screen, smoothstep(0.3, 0.7, lum));
    blendedColor = mix(texColor, blendedColor, colorInfluence * smoothstep(0.05, 0.5, lum));

    // === SUN CORONA / GLOW ===
    // Fresnel-based rim glow
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);

    vec3 fresnelColor = palette(slowT * 2.0 + fresnel);
    blendedColor += fresnelColor * fresnel * u_glowStrength * alpha;

    // Inner glow based on displacement
    vec3 displacementColor = solarPalette(vDisplacement * 5.0 + slowT);
    blendedColor += displacementColor * abs(vDisplacement) * 2.0 * alpha;

    // === ENERGY PULSES ===
    float pulse1 = sin(length(vPosition) * 15.0 - t * 4.0) * 0.5 + 0.5;
    float pulse2 = sin(length(vPosition) * 20.0 - t * 5.0 + PI) * 0.5 + 0.5;
    vec3 pulseColor = auroraPalette(slowT + 0.5);
    blendedColor += pulseColor * pulse1 * pulse2 * 0.15 * alpha;

    // === SOLAR FLARES ===
    float flareAngle = atan(vPosition.y, vPosition.x);
    float flareNoise = fbm(vec3(flareAngle * 3.0, length(vPosition.xy) * 2.0, t));
    float flare = smoothstep(0.3, 0.8, flareNoise) * smoothstep(1.0, 0.5, length(vPosition.xy));
    vec3 flareColor = solarPalette(flareAngle / TAU + slowT);
    blendedColor += flareColor * flare * 0.3 * alpha;

    // === FINAL ENHANCEMENT ===
    // Boost saturation
    float finalLum = dot(blendedColor, vec3(0.299, 0.587, 0.114));
    blendedColor = mix(vec3(finalLum), blendedColor, 1.5);

    // Contrast
    blendedColor = (blendedColor - 0.5) * 1.15 + 0.5;

    // HDR bloom simulation
    float brightness = max(max(blendedColor.r, blendedColor.g), blendedColor.b);
    if (brightness > 0.85) {
      blendedColor += (blendedColor - 0.85) * 0.6;
    }

    blendedColor = clamp(blendedColor, 0.0, 1.0);

    gl_FragColor = vec4(blendedColor, alpha);
  }
`;

// Glow/corona effect shader
const glowVertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const glowFragmentShader = `
  uniform float u_time;
  uniform float u_intensity;
  uniform vec3 u_color1;
  uniform vec3 u_color2;
  uniform vec3 u_color3;

  varying vec3 vNormal;
  varying vec3 vPosition;

  #define TAU 6.28318530718

  vec3 palette(float t) {
    return mix(mix(u_color1, u_color2, smoothstep(0.0, 0.5, t)), u_color3, smoothstep(0.5, 1.0, t));
  }

  void main() {
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.5);

    float t = u_time * 0.2;
    float colorShift = sin(t + vPosition.y * 2.0) * 0.5 + 0.5;

    vec3 glowColor = palette(colorShift);

    // Pulsing intensity
    float pulse = 0.7 + sin(u_time * 2.0) * 0.3;

    float alpha = fresnel * u_intensity * pulse;

    gl_FragColor = vec4(glowColor, alpha * 0.6);
  }
`;

type PlanetMeshProps = {
  textureUrl: string;
};

function PlanetMesh({ textureUrl }: PlanetMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const glowMaterialRef = useRef<THREE.ShaderMaterial>(null);

  // Load texture
  const texture = useLoader(THREE.TextureLoader, textureUrl);

  // Create shader material
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        u_time: { value: 0 },
        u_texture: { value: texture },
        u_distortionStrength: { value: 1.0 },
        u_colorIntensity: { value: 0.75 },
        u_glowStrength: { value: 0.8 },
      },
      transparent: true,
      side: THREE.DoubleSide,
    });
  }, [texture]);

  // Glow material
  const glowMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: glowVertexShader,
      fragmentShader: glowFragmentShader,
      uniforms: {
        u_time: { value: 0 },
        u_intensity: { value: 1.0 },
        u_color1: { value: new THREE.Color('#FFD700') }, // Gold
        u_color2: { value: new THREE.Color('#FF1493') }, // Deep Pink
        u_color3: { value: new THREE.Color('#00BCD4') }, // Cyan
      },
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, []);

  // Animation loop
  useFrame((state) => {
    const time = state.clock.elapsedTime;

    if (materialRef.current?.uniforms.u_time) {
      materialRef.current.uniforms.u_time.value = time;
    }

    if (glowMaterialRef.current?.uniforms.u_time) {
      glowMaterialRef.current.uniforms.u_time.value = time;

      // Animate glow colors
      const hue1 = (time * 0.1) % 1;
      const hue2 = (time * 0.1 + 0.33) % 1;
      const hue3 = (time * 0.1 + 0.67) % 1;

      glowMaterialRef.current.uniforms.u_color1?.value.setHSL(hue1, 1, 0.5);
      glowMaterialRef.current.uniforms.u_color2?.value.setHSL(hue2, 1, 0.5);
      glowMaterialRef.current.uniforms.u_color3?.value.setHSL(hue3, 1, 0.5);
    }

    // Slow rotation
    if (meshRef.current) {
      meshRef.current.rotation.y = time * 0.1;
      meshRef.current.rotation.x = Math.sin(time * 0.05) * 0.1;
    }

    if (glowRef.current) {
      glowRef.current.rotation.y = time * 0.1;
      glowRef.current.rotation.x = Math.sin(time * 0.05) * 0.1;
    }
  });

  return (
    <group>
      {/* Outer glow */}
      <mesh ref={glowRef} scale={1.15}>
        <sphereGeometry args={[1, 64, 64]} />
        <primitive object={glowMaterial} ref={glowMaterialRef} attach="material" />
      </mesh>

      {/* Main planet */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <primitive object={shaderMaterial} ref={materialRef} attach="material" />
      </mesh>
    </group>
  );
}

type LogoPlanetProps = {
  src: string;
  className?: string;
  width?: number;
  height?: number;
};

export function LogoPlanet({ src, className, width = 96, height = 96 }: LogoPlanetProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Check for reduced motion preference
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  if (!isClient) {
    return (
      <div
        className={cn('bg-transparent', className)}
        style={{ width, height }}
      />
    );
  }

  if (prefersReducedMotion) {
    // Static fallback
    return (
      <img
        src={src}
        alt="Roundtable"
        className={cn('object-contain', className)}
        style={{ width, height }}
      />
    );
  }

  return (
    <div className={cn('relative', className)} style={{ width, height }}>
      <Canvas
        camera={{ position: [0, 0, 2.5], fov: 50 }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
        }}
        style={{ background: 'transparent' }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[5, 5, 5]} intensity={0.5} />
        <pointLight position={[-5, -5, 5]} intensity={0.3} color="#ff69b4" />
        <PlanetMesh textureUrl={src} />
      </Canvas>
    </div>
  );
}
