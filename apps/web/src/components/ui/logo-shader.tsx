'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/ui/cn';

// Vertex shader
const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

// Advanced fragment shader - planetary sun with color plasma warping
const FRAGMENT_SHADER = `
  precision highp float;

  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec2 u_mouse;

  #define PI 3.14159265359
  #define TAU 6.28318530718

  // ============================================
  // NOISE FUNCTIONS - Multi-octave for turbulence
  // ============================================

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  // 3D Simplex noise for volumetric effects
  float snoise3D(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
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

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

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

  // Fractal Brownian Motion - creates turbulent, organic patterns
  float fbm(vec3 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    float lacunarity = 2.0;
    float persistence = 0.5;

    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      value += amplitude * snoise3D(p * frequency);
      frequency *= lacunarity;
      amplitude *= persistence;
    }
    return value;
  }

  // Domain warping - creates flowing, liquid-like distortions
  vec2 warpDomain(vec2 p, float t) {
    float warp1 = fbm(vec3(p * 2.0, t * 0.3), 4);
    float warp2 = fbm(vec3(p * 2.0 + 5.2, t * 0.3 + 1.3), 4);
    return p + vec2(warp1, warp2) * 0.15;
  }

  // ============================================
  // COLOR PALETTE - Vibrant planetary colors
  // ============================================

  vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(TAU * (c * t + d));
  }

  // Solar/plasma color palette
  vec3 solarPalette(float t) {
    // Gold -> Orange -> Magenta -> Purple -> Blue -> Cyan -> Green -> back
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 1.0, 1.0);
    vec3 d = vec3(0.0, 0.33, 0.67);
    return palette(t, a, b, c, d);
  }

  // Nebula color palette - more ethereal
  vec3 nebulaPalette(float t) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 0.7, 0.4);
    vec3 d = vec3(0.0, 0.15, 0.20);
    return palette(t, a, b, c, d);
  }

  // ============================================
  // MAIN SHADER
  // ============================================

  void main() {
    vec2 uv = v_texCoord;
    vec2 centeredUV = uv - 0.5;
    float dist = length(centeredUV);
    float angle = atan(centeredUV.y, centeredUV.x);

    float t = u_time * 0.4;
    float slowT = u_time * 0.15;
    float fastT = u_time * 0.8;

    // ========== INTENSE DOMAIN WARPING ==========
    // Multiple layers of warping for liquid planet surface

    vec2 warpedUV = uv;

    // Layer 1: Large-scale turbulent flow
    float flowAngle = fbm(vec3(uv * 1.5, t * 0.2), 5) * TAU;
    vec2 flow = vec2(cos(flowAngle), sin(flowAngle)) * 0.08;
    warpedUV += flow;

    // Layer 2: Medium swirling vortices
    float vortexStrength = 0.12 * (1.0 + sin(t * 0.5) * 0.3);
    float vortexAngle = dist * 8.0 - t * 2.0 + fbm(vec3(uv * 3.0, t), 3) * 4.0;
    vec2 vortex = vec2(cos(vortexAngle), sin(vortexAngle)) * vortexStrength * smoothstep(0.5, 0.1, dist);
    warpedUV += vortex;

    // Layer 3: Fine-detail turbulence
    vec2 turbulence = vec2(
      fbm(vec3(uv * 6.0 + vec2(t * 0.3, 0.0), t * 0.5), 6),
      fbm(vec3(uv * 6.0 + vec2(0.0, t * 0.3), t * 0.5 + 100.0), 6)
    ) * 0.06;
    warpedUV += turbulence;

    // Layer 4: Radial pulsing distortion
    float pulse = sin(dist * 15.0 - t * 3.0) * 0.02 * smoothstep(0.5, 0.2, dist);
    warpedUV += centeredUV * pulse;

    // ========== CHROMATIC SEPARATION - DRAMATIC ==========
    // Strong RGB channel splitting that pulses and swirls

    float chromaStrength = 0.025 + sin(t * 0.7) * 0.015 + fbm(vec3(uv * 2.0, t), 3) * 0.01;
    float chromaAngle = angle + t * 0.5 + fbm(vec3(uv * 4.0, t * 0.3), 4) * 2.0;

    vec2 redOffset = vec2(cos(chromaAngle), sin(chromaAngle)) * chromaStrength * (1.0 + dist);
    vec2 blueOffset = vec2(cos(chromaAngle + PI), sin(chromaAngle + PI)) * chromaStrength * (1.0 + dist);
    vec2 greenOffset = vec2(cos(chromaAngle + PI * 0.5), sin(chromaAngle + PI * 0.5)) * chromaStrength * 0.5 * dist;

    // Sample texture with warped coordinates and chromatic aberration
    float r = texture2D(u_texture, warpedUV + redOffset).r;
    float g = texture2D(u_texture, warpedUV + greenOffset).g;
    float b = texture2D(u_texture, warpedUV + blueOffset).b;
    float a = texture2D(u_texture, warpedUV).a;

    vec3 texColor = vec3(r, g, b);

    // ========== PLASMA COLOR MIXING ==========
    // Creates flowing bands of color that blend into each other

    // Generate plasma patterns
    float plasma1 = fbm(vec3(warpedUV * 3.0, t * 0.4), 5);
    float plasma2 = fbm(vec3(warpedUV * 5.0 + 10.0, t * 0.3 + 50.0), 4);
    float plasma3 = sin(warpedUV.x * 10.0 + t + plasma1 * 5.0) * cos(warpedUV.y * 10.0 + t * 1.3 + plasma2 * 5.0);

    float plasmaValue = (plasma1 + plasma2 * 0.5 + plasma3 * 0.3) * 0.5 + 0.5;
    plasmaValue = plasmaValue + slowT * 0.1; // Animate through color spectrum

    // Get vibrant colors from palette
    vec3 plasmaColor = solarPalette(plasmaValue);
    vec3 nebulaColor = nebulaPalette(plasmaValue + 0.3);

    // Mix based on position and time
    float colorMix = fbm(vec3(warpedUV * 2.0, t * 0.2), 4) * 0.5 + 0.5;
    vec3 dynamicColor = mix(plasmaColor, nebulaColor, colorMix);

    // ========== BLEND COLORS INTO TEXTURE ==========
    // Strong color influence that warps through the logo

    float colorInfluence = 0.6 + sin(t * 0.3) * 0.15; // Strong, pulsing blend

    // Luminance-based blending - brighter areas get more color
    float lum = dot(texColor, vec3(0.299, 0.587, 0.114));
    float blendFactor = smoothstep(0.1, 0.8, lum) * colorInfluence;

    // Color dodge-like blend for intensity
    vec3 colorDodge = texColor / (1.0 - dynamicColor * 0.5 + 0.001);

    // Overlay blend
    vec3 overlay = mix(
      2.0 * texColor * dynamicColor,
      1.0 - 2.0 * (1.0 - texColor) * (1.0 - dynamicColor),
      step(0.5, lum)
    );

    // Combine blending modes
    vec3 blendedColor = mix(texColor, mix(overlay, colorDodge, 0.3), blendFactor);

    // ========== SUN CORONA / GLOW EFFECT ==========
    // Dramatic outer glow that pulses and shifts colors

    float coronaDist = smoothstep(0.5, 0.25, dist);
    float coronaRays = 0.0;

    // Multiple ray layers
    for (float i = 0.0; i < 3.0; i++) {
      float rayAngle = angle * (6.0 + i * 2.0) + t * (0.5 + i * 0.2) + fbm(vec3(vec2(angle, dist) * 2.0, t + i), 3) * 2.0;
      coronaRays += sin(rayAngle) * 0.5 + 0.5;
    }
    coronaRays /= 3.0;

    // Corona color - shifts through spectrum
    vec3 coronaColor = solarPalette(slowT + dist * 2.0 + coronaRays * 0.5);

    // Inner glow intensity
    float innerGlow = smoothstep(0.4, 0.15, dist) * (0.8 + sin(t * 2.0) * 0.2);

    // Outer corona rays
    float outerCorona = smoothstep(0.2, 0.5, dist) * smoothstep(0.7, 0.4, dist);
    outerCorona *= coronaRays * (0.6 + sin(t * 1.5) * 0.4);

    // Add corona to color
    blendedColor += coronaColor * innerGlow * 0.4;
    blendedColor += coronaColor * outerCorona * 0.5;

    // ========== FRESNEL EDGE GLOW ==========
    // Bright rim lighting effect

    float fresnel = pow(1.0 - smoothstep(0.3, 0.48, dist), 2.0);
    vec3 fresnelColor = solarPalette(slowT * 2.0 + angle / TAU);
    blendedColor += fresnelColor * fresnel * 0.6 * a;

    // ========== ENERGY PULSES ==========
    // Waves of energy that ripple outward

    float pulseWave1 = sin(dist * 20.0 - t * 4.0) * 0.5 + 0.5;
    float pulseWave2 = sin(dist * 30.0 - t * 5.0 + PI) * 0.5 + 0.5;
    float pulseMask = smoothstep(0.5, 0.2, dist) * smoothstep(0.0, 0.15, dist);

    vec3 pulseColor = solarPalette(slowT + 0.5);
    blendedColor += pulseColor * pulseWave1 * pulseWave2 * pulseMask * 0.15;

    // ========== FINAL COLOR ENHANCEMENT ==========
    // Boost saturation and contrast for maximum pop

    // Increase saturation
    float finalLum = dot(blendedColor, vec3(0.299, 0.587, 0.114));
    blendedColor = mix(vec3(finalLum), blendedColor, 1.4); // 1.4x saturation

    // Slight contrast boost
    blendedColor = (blendedColor - 0.5) * 1.1 + 0.5;

    // Ensure we don't clip too hard
    blendedColor = clamp(blendedColor, 0.0, 1.0);

    // Add subtle HDR-like bloom on bright areas
    float brightness = max(max(blendedColor.r, blendedColor.g), blendedColor.b);
    if (brightness > 0.8) {
      blendedColor += (blendedColor - 0.8) * 0.5;
    }

    gl_FragColor = vec4(blendedColor, a);
  }
`;

type LogoShaderProps = {
  src: string;
  className?: string;
  width?: number;
  height?: number;
};

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function createProgram(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

export function LogoShader({ src, className, width = 96, height = 96 }: LogoShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const animationRef = useRef<number>(0);
  const glRef = useRef<{
    gl: WebGLRenderingContext;
    program: WebGLProgram;
    timeLocation: WebGLUniformLocation;
    resolutionLocation: WebGLUniformLocation;
    mouseLocation: WebGLUniformLocation;
  } | null>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      antialias: true,
    });

    if (!gl) {
      console.warn('WebGL not supported');
      return;
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

    if (!vertexShader || !fragmentShader) return;

    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) return;

    gl.useProgram(program);

    // Geometry setup
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

    const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    const timeLocation = gl.getUniformLocation(program, 'u_time');
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    const mouseLocation = gl.getUniformLocation(program, 'u_mouse');
    const textureLocation = gl.getUniformLocation(program, 'u_texture');

    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform2f(mouseLocation, 0.5, 0.5);
    gl.uniform1i(textureLocation, 0);

    // Load texture
    const texture = gl.createTexture();
    const image = new Image();
    image.crossOrigin = 'anonymous';

    image.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      glRef.current = {
        gl,
        program,
        timeLocation: timeLocation!,
        resolutionLocation: resolutionLocation!,
        mouseLocation: mouseLocation!,
      };

      setIsLoaded(true);

      if (prefersReducedMotion) {
        gl.uniform1f(timeLocation, 0);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };

    image.src = src;

    // Mouse tracking for interactive effects
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: 1.0 - (e.clientY - rect.top) / rect.height,
      };
    };

    canvas.addEventListener('mousemove', handleMouseMove);

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteTexture(texture);
    };
  }, [src]);

  // Animation loop
  useEffect(() => {
    if (!isLoaded || !glRef.current) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const { gl, timeLocation, mouseLocation } = glRef.current;
    const startTime = performance.now();

    const render = () => {
      const time = (performance.now() - startTime) / 1000;

      gl.uniform1f(timeLocation, time);
      gl.uniform2f(mouseLocation, mouseRef.current.x, mouseRef.current.y);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isLoaded]);

  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

  return (
    <canvas
      ref={canvasRef}
      width={width * dpr}
      height={height * dpr}
      className={cn('w-full h-full object-contain', className)}
      style={{
        width,
        height,
        opacity: isLoaded ? 1 : 0,
        transition: 'opacity 0.3s ease-in-out',
      }}
    />
  );
}
