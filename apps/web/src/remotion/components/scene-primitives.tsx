/**
 * Scene Primitives with 3D Effects
 *
 * Higher-order components for cinematic scene construction.
 * Includes depth layers, camera wrappers, and transitions.
 */

import type { CSSProperties, ReactNode } from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

import type { CameraPosition, DepthLayer, Particle } from '../lib/camera-3d';
import {
  CAMERA_SPRINGS,
  cameraToTransform,
  DEFAULT_CAMERA,
  generateParticles,
  getCameraPosition,
  getDepthLayerStyles,
  getParticlePosition,
} from '../lib/camera-3d';
import { BACKGROUNDS, BRAND } from '../lib/design-tokens';

// ============================================================================
// Unified Depth Particles Background
// ============================================================================

type DepthParticlesProps = {
  /** Current frame for animation */
  frame: number;
  /** Number of particles (default 15) */
  count?: number;
  /** Base opacity for particles (default 0.3) */
  baseOpacity?: number;
  /** Blur amount in pixels (default 25) */
  blur?: number;
  /** Intensity multiplier for opacity and speed (default 1.0) */
  intensity?: number;
};

/**
 * Unified rainbow depth particles background.
 * Uses BRAND.logoGradient colors for consistent visual treatment across all scenes.
 */
export function DepthParticles({
  frame,
  count = 15,
  baseOpacity = 0.3,
  blur = 25,
  intensity = 1.0,
}: DepthParticlesProps) {
  const rainbowColors = BRAND.logoGradient;
  const particles = [];

  for (let i = 0; i < count; i++) {
    const baseX = (i * 137.5) % 100;
    const baseY = (i * 73.3) % 100;
    const size = 4 + (i % 5) * 2;
    const colorIndex = i % rainbowColors.length;
    const speed = (0.3 + (i % 4) * 0.15) * intensity;

    const x = baseX + Math.sin(frame * 0.012 * speed + i) * 4;
    const y = baseY + Math.cos(frame * 0.008 * speed + i * 0.5) * 4;

    particles.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          left: `${x}%`,
          top: `${y}%`,
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: rainbowColors[colorIndex],
          opacity: baseOpacity * intensity,
        }}
      />,
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        filter: `blur(${blur}px)`,
        pointerEvents: 'none',
      }}
    >
      {particles}
    </div>
  );
}

// ============================================================================
// Edge Vignette Effect
// ============================================================================

type EdgeVignetteProps = {
  /** Inner transparent radius percentage (default 50) */
  innerRadius?: number;
  /** Opacity at the edges (default 0.5) */
  edgeOpacity?: number;
};

/**
 * Radial gradient vignette effect for cinematic edge darkening.
 */
export function EdgeVignette({
  innerRadius = 50,
  edgeOpacity = 0.5,
}: EdgeVignetteProps) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse at center, transparent ${innerRadius}%, rgba(26, 26, 26, ${edgeOpacity}) 100%)`,
        pointerEvents: 'none',
      }}
    />
  );
}

// ============================================================================
// Scene Container with Camera
// ============================================================================

type SceneContainerProps = {
  children: ReactNode;
  /** Starting camera position */
  cameraFrom?: CameraPosition;
  /** Ending camera position */
  cameraTo?: CameraPosition;
  /** Frame to start camera movement */
  cameraStartFrame?: number;
  /** Duration of camera movement in frames */
  cameraDuration?: number;
  /** Background color */
  background?: string;
  /** Enable particle effect */
  particles?: boolean;
  /** Particle count (default 30) */
  particleCount?: number;
};

export function SceneContainer({
  children,
  cameraFrom = DEFAULT_CAMERA,
  cameraTo = DEFAULT_CAMERA,
  cameraStartFrame = 0,
  cameraDuration = 60,
  background = BACKGROUNDS.primary,
  particles = false,
  particleCount = 30,
}: SceneContainerProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const camera = getCameraPosition(
    frame,
    fps,
    cameraFrom,
    cameraTo,
    cameraStartFrame,
    cameraDuration,
    CAMERA_SPRINGS.cinematic,
  );

  const particleList = particles ? generateParticles(particleCount) : [];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: background,
        perspective: 1200,
        perspectiveOrigin: 'center center',
        overflow: 'hidden',
      }}
    >
      {/* Particle layer */}
      {particles && (
        <ParticleField particles={particleList} camera={camera} />
      )}

      {/* Main content with camera transform */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: cameraToTransform(camera),
          transformStyle: 'preserve-3d',
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
}

// ============================================================================
// Depth Layer Wrapper
// ============================================================================

type DepthLayerWrapperProps = {
  children: ReactNode;
  layer: DepthLayer;
  camera?: CameraPosition;
  style?: CSSProperties;
};

export function DepthLayerWrapper({
  children,
  layer,
  camera = DEFAULT_CAMERA,
  style,
}: DepthLayerWrapperProps) {
  const layerStyles = getDepthLayerStyles(layer, camera);

  return (
    <div
      style={{
        ...layerStyles,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Particle Field
// ============================================================================

type ParticleFieldProps = {
  particles: Particle[];
  camera: CameraPosition;
};

function ParticleField({ particles, camera }: ParticleFieldProps) {
  const frame = useCurrentFrame();

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {particles.map((particle) => {
        const pos = getParticlePosition(particle, frame, camera);
        return (
          <div
            key={particle.id}
            style={{
              position: 'absolute',
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              width: particle.size,
              height: particle.size,
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              opacity: pos.opacity,
              filter: `blur(${pos.blur}px)`,
              transform: 'translate(-50%, -50%)',
            }}
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// Text Animations
// ============================================================================

type AnimatedTextProps = {
  children: string;
  delay?: number;
  /** Animation style */
  animation?: 'fade' | 'slide-up' | 'slide-down' | 'scale' | 'typewriter';
  /** Duration in frames */
  duration?: number;
  style?: CSSProperties;
};

export function AnimatedText({
  children,
  delay = 0,
  animation = 'slide-up',
  duration = 20,
  style,
}: AnimatedTextProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 30, stiffness: 200, mass: 0.8 },
    durationInFrames: duration,
  });

  let animationStyles: CSSProperties = {};

  switch (animation) {
    case 'fade':
      animationStyles = {
        opacity: interpolate(progress, [0, 1], [0, 1]),
      };
      break;
    case 'slide-up':
      animationStyles = {
        opacity: interpolate(progress, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `translateY(${interpolate(progress, [0, 1], [30, 0])}px)`,
      };
      break;
    case 'slide-down':
      animationStyles = {
        opacity: interpolate(progress, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `translateY(${interpolate(progress, [0, 1], [-30, 0])}px)`,
      };
      break;
    case 'scale':
      animationStyles = {
        opacity: interpolate(progress, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `scale(${interpolate(progress, [0, 1], [0.8, 1])})`,
      };
      break;
    case 'typewriter':
      // Handled separately
      break;
  }

  if (animation === 'typewriter') {
    const charsToShow = Math.floor(
      interpolate(frame - delay, [0, duration], [0, children.length], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      }),
    );
    return (
      <span style={style}>
        {children.slice(0, charsToShow)}
        {charsToShow < children.length && (
          <span style={{ opacity: frame % 10 < 5 ? 1 : 0 }}>|</span>
        )}
      </span>
    );
  }

  return <span style={{ ...style, ...animationStyles }}>{children}</span>;
}

// ============================================================================
// Headline with Subtitle
// ============================================================================

type HeadlineProps = {
  headline: string;
  subtitle?: string;
  delay?: number;
  headlineStyle?: CSSProperties;
  subtitleStyle?: CSSProperties;
  align?: 'left' | 'center' | 'right';
};

export function Headline({
  headline,
  subtitle,
  delay = 0,
  headlineStyle,
  subtitleStyle,
  align = 'center',
}: HeadlineProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        gap: 12,
      }}
    >
      <AnimatedText
        delay={delay}
        animation="slide-up"
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: '#ffffff',
          fontFamily: '\'Noto Sans\', system-ui, sans-serif',
          textAlign: align,
          ...headlineStyle,
        }}
      >
        {headline}
      </AnimatedText>
      {subtitle && (
        <AnimatedText
          delay={delay + 10}
          animation="fade"
          style={{
            fontSize: 24,
            fontWeight: 500,
            color: '#a3a3a3',
            fontFamily: '\'Noto Sans\', system-ui, sans-serif',
            textAlign: align,
            ...subtitleStyle,
          }}
        >
          {subtitle}
        </AnimatedText>
      )}
    </div>
  );
}

// ============================================================================
// Feature Label (floating text)
// ============================================================================

type FeatureLabelProps = {
  text: string;
  delay?: number;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  style?: CSSProperties;
};

export function FeatureLabel({
  text,
  delay = 0,
  position = 'bottom-left',
  style,
}: FeatureLabelProps) {
  const positionStyles: CSSProperties = {
    'top-left': { top: 40, left: 40 },
    'top-right': { top: 40, right: 40 },
    'bottom-left': { bottom: 40, left: 40 },
    'bottom-right': { bottom: 40, right: 40 },
    'center': { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  }[position];

  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyles,
        zIndex: 100,
      }}
    >
      <AnimatedText
        delay={delay}
        animation="slide-up"
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: '#ffffff',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(10px)',
          padding: '10px 20px',
          borderRadius: 12,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          fontFamily: '\'Noto Sans\', system-ui, sans-serif',
          ...style,
        }}
      >
        {text}
      </AnimatedText>
    </div>
  );
}

// ============================================================================
// Scene Transition Effects
// ============================================================================

type TransitionType = 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'zoom' | 'blur';

type SceneTransitionProps = {
  children: ReactNode;
  type?: TransitionType;
  /** Frame when transition starts */
  enterFrame?: number;
  /** Frame when exit transition starts */
  exitFrame?: number;
  /** Duration of transition in frames */
  duration?: number;
};

export function SceneTransition({
  children,
  type = 'fade',
  enterFrame = 0,
  exitFrame = Infinity,
  duration = 15,
}: SceneTransitionProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Enter animation
  const enterProgress = spring({
    frame: frame - enterFrame,
    fps,
    config: { damping: 30, stiffness: 200, mass: 0.8 },
    durationInFrames: duration,
  });

  // Exit animation
  const exitProgress = exitFrame < Infinity
    ? spring({
        frame: frame - exitFrame,
        fps,
        config: { damping: 30, stiffness: 200, mass: 0.8 },
        durationInFrames: duration,
      })
    : 0;

  // Combined progress (enter up, exit down)
  const progress = Math.min(enterProgress, 1 - exitProgress);

  let transitionStyles: CSSProperties = {};

  switch (type) {
    case 'fade':
      transitionStyles = {
        opacity: interpolate(progress, [0, 1], [0, 1]),
      };
      break;
    case 'slide-left':
      transitionStyles = {
        opacity: interpolate(progress, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `translateX(${interpolate(progress, [0, 1], [100, 0])}px)`,
      };
      break;
    case 'slide-right':
      transitionStyles = {
        opacity: interpolate(progress, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `translateX(${interpolate(progress, [0, 1], [-100, 0])}px)`,
      };
      break;
    case 'slide-up':
      transitionStyles = {
        opacity: interpolate(progress, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `translateY(${interpolate(progress, [0, 1], [50, 0])}px)`,
      };
      break;
    case 'zoom':
      transitionStyles = {
        opacity: interpolate(progress, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `scale(${interpolate(progress, [0, 1], [0.9, 1])})`,
      };
      break;
    case 'blur':
      transitionStyles = {
        opacity: interpolate(progress, [0, 1], [0, 1]),
        filter: `blur(${interpolate(progress, [0, 1], [10, 0])}px)`,
      };
      break;
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        ...transitionStyles,
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Spotlight Effect
// ============================================================================

type SpotlightProps = {
  /** Center X position (0-100%) */
  x?: number;
  /** Center Y position (0-100%) */
  y?: number;
  /** Spotlight radius */
  radius?: number;
  /** Edge softness */
  softness?: number;
  /** Delay before spotlight appears */
  delay?: number;
  children: ReactNode;
};

export function Spotlight({
  x = 50,
  y = 50,
  radius = 300,
  softness = 100,
  delay = 0,
  children,
}: SpotlightProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 50, stiffness: 150, mass: 1 },
    durationInFrames: 30,
  });

  const currentRadius = interpolate(progress, [0, 1], [0, radius]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {children}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at ${x}% ${y}%, transparent ${currentRadius}px, rgba(0,0,0,0.7) ${currentRadius + softness}px)`,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// ============================================================================
// Glow Effect
// ============================================================================

type GlowProps = {
  children: ReactNode;
  color?: string;
  intensity?: number;
  delay?: number;
  pulse?: boolean;
};

export function Glow({
  children,
  color = 'rgba(168, 85, 247, 0.6)',
  intensity = 20,
  delay = 0,
  pulse = false,
}: GlowProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enterProgress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 30, stiffness: 200, mass: 0.8 },
    durationInFrames: 20,
  });

  const pulseAmount = pulse ? Math.sin(frame * 0.1) * 0.3 + 0.7 : 1;
  const currentIntensity = intensity * enterProgress * pulseAmount;

  return (
    <div
      style={{
        position: 'relative',
        filter: `drop-shadow(0 0 ${currentIntensity}px ${color})`,
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Glass Panel (for UI showcases)
// ============================================================================

type GlassPanelProps = {
  children: ReactNode;
  width?: number | string;
  height?: number | string;
  delay?: number;
  style?: CSSProperties;
};

export function GlassPanel({
  children,
  width = 'auto',
  height = 'auto',
  delay = 0,
  style,
}: GlassPanelProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 25, stiffness: 200, mass: 0.7 },
    durationInFrames: 25,
  });

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: 'rgba(40, 40, 40, 0.8)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 20,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        opacity: interpolate(progress, [0, 1], [0, 1]),
        transform: `scale(${interpolate(progress, [0, 1], [0.95, 1])}) translateY(${interpolate(progress, [0, 1], [20, 0])}px)`,
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
