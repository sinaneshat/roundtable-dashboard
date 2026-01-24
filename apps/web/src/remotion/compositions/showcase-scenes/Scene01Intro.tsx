/**
 * Scene 1: Epic Intro with Logo Reveal
 * Duration: 0-3s (90 frames at 30fps)
 *
 * Camera: Dramatic zoom-out reveal with subtle rotation
 * 3D Effect: Logo emerges from depth with parallax blur layers
 * Text: Logo scales with spring, tagline fades in from below
 *
 * Cinematic Effects:
 * - Zoom-out camera movement (1.3x to 1x)
 * - Floating breathing motion
 * - Multi-layer parallax particles
 * - Focus pull from blur to sharp
 */

import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

import { EdgeVignette } from '../../components/scene-primitives';
import { useCinematicCamera, useFocusPull } from '../../hooks';
import { BACKGROUNDS, BRAND, RAINBOW, SPACING, TEXT, TYPOGRAPHY } from '../../lib/design-tokens';

export function Scene01Intro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // === CINEMATIC CAMERA ===
  // Dramatic zoom-out reveal with breathing
  const { transform: cameraTransform, breathingOffset } = useCinematicCamera({
    movement: 'reveal',
    startFrame: 0,
    duration: 50,
    intensity: 0.8,
    breathingEnabled: true,
    breathingIntensity: 4,
  });

  // Focus pull effect - blur to sharp
  const { filter: focusFilter } = useFocusPull({
    startFrame: 0,
    duration: 30,
    maxBlur: 8,
  });

  // Logo entrance spring - bouncy reveal
  const logoProgress = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 100, mass: 0.8 },
    durationInFrames: 40,
  });

  // Tagline entrance - delayed
  const taglineProgress = spring({
    frame: frame - 25,
    fps,
    config: { damping: 200 }, // Smooth, no bounce
    durationInFrames: 30,
  });

  // Subtitle entrance - more delayed
  const subtitleProgress = spring({
    frame: frame - 40,
    fps,
    config: { damping: 200 },
    durationInFrames: 25,
  });

  // Rainbow border rotation - faster for more energy
  const glowRotation = interpolate(frame, [0, 90], [0, 270]);

  // Logo animations
  const logoScale = interpolate(logoProgress, [0, 1], [0.3, 1]);
  const logoOpacity = interpolate(logoProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Tagline animations
  const taglineOpacity = interpolate(taglineProgress, [0, 1], [0, 1]);
  const taglineY = interpolate(taglineProgress, [0, 1], [30, 0]);

  // Subtitle animations
  const subtitleOpacity = interpolate(subtitleProgress, [0, 1], [0, 1]);

  // Background glow pulse - tied to camera breathing
  const glowPulse = Math.sin(frame * 0.1) * 0.2 + 0.8;

  // Particle layer depth blur - enhanced with camera movement
  const backgroundBlur = interpolate(frame, [0, 60], [20, 3], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BACKGROUNDS.primary,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        perspective: 1200,
        perspectiveOrigin: 'center center',
      }}
    >
      {/* Background depth layer - blurred particles with parallax */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          filter: `blur(${backgroundBlur}px)`,
          opacity: 0.4,
          transform: `translate(${breathingOffset.x * 0.3}px, ${breathingOffset.y * 0.3}px)`,
        }}
      >
        {/* Floating particles - far depth layer */}
        {Array.from({ length: 25 }).map((_, i) => {
          const x = (Math.sin(i * 1.5) * 40 + 50);
          const y = (Math.cos(i * 2.1) * 30 + 50);
          const size = 4 + (i % 5) * 2;
          const floatY = Math.sin(frame * 0.05 + i) * 10;
          const floatX = Math.cos(frame * 0.03 + i * 0.7) * 5;
          // Rainbow colors for particles
          const color = BRAND.logoGradient[i % BRAND.logoGradient.length];

          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                width: size,
                height: size,
                borderRadius: '50%',
                backgroundColor: color,
                opacity: 0.6,
                transform: `translate(${floatX}px, ${floatY}px)`,
              }}
            />
          );
        })}
      </div>

      {/* Background gradient glow - moves with camera */}
      <div
        style={{
          position: 'absolute',
          width: 900,
          height: 900,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${BRAND.colors.primary}50 0%, transparent 70%)`,
          filter: 'blur(100px)',
          opacity: logoOpacity * glowPulse,
          transform: `scale(${logoScale}) translate(${breathingOffset.x * 0.5}px, ${breathingOffset.y * 0.5}px)`,
        }}
      />

      {/* Main content with camera transform */}
      <div
        style={{
          transform: cameraTransform,
          transformStyle: 'preserve-3d',
          filter: focusFilter,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Logo container with rainbow border */}
        <div
          style={{
            transform: `scale(${logoScale})`,
            opacity: logoOpacity,
          }}
        >
          <div
            style={{
              position: 'relative',
              padding: 5,
              borderRadius: 36,
              background: `linear-gradient(${glowRotation}deg, ${RAINBOW.colors.slice(0, 6).join(', ')})`,
              boxShadow: `0 0 60px ${BRAND.colors.primary}40`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                padding: '28px 48px',
                borderRadius: 32,
                backgroundColor: BACKGROUNDS.primary,
              }}
            >
              {/* Actual logo */}
              <Img
                src={staticFile('static/logo.webp')}
                width={100}
                height={100}
                style={{ objectFit: 'contain' }}
              />
              {/* Brand name */}
              <span
                style={{
                  fontSize: 72,
                  fontWeight: 700,
                  color: TEXT.primary,
                  letterSpacing: '-0.02em',
                  fontFamily: '\'Noto Sans\', system-ui, sans-serif',
                }}
              >
                Roundtable
              </span>
            </div>
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            marginTop: SPACING.xl,
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
          }}
        >
          <span
            style={{
              ...TYPOGRAPHY.h2,
              color: TEXT.secondary,
              textAlign: 'center',
            }}
          >
            {BRAND.tagline}
          </span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            marginTop: SPACING.md,
            opacity: subtitleOpacity,
          }}
        >
          <span
            style={{
              ...TYPOGRAPHY.body,
              color: TEXT.muted,
            }}
          >
            AI brainstorming, reimagined
          </span>
        </div>
      </div>

      {/* Edge vignette for cinematic feel */}
      <EdgeVignette innerRadius={50} edgeOpacity={0.4} />
    </AbsoluteFill>
  );
}
