/**
 * Scene 1: Clean Intro with Logo Reveal
 * Duration: 0-5s (150 frames at 30fps)
 *
 * Elements:
 * - DepthParticles background (subtle 2D particles)
 * - Background radial gradient glow
 * - LogoOverlay (HTML logo + text with rainbow border)
 * - TextOverlay (tagline + subtitle)
 * - EdgeVignette for cinematic feel
 */

import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

import { DepthParticles, EdgeVignette, RainbowGlowOrbs, RainbowLogoContainer } from '../../components/scene-primitives';
import { BACKGROUNDS, BRAND, SPACING, TEXT, TYPOGRAPHY } from '../../lib/design-tokens';

// ============================================================================
// 2D Logo Overlay (renders HTML logo on top of 3D canvas for best quality)
// ============================================================================

function LogoOverlay() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo entrance animation - simple scale + fade, NO 3D rotation
  const entranceProgress = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 45,
  });

  // Scale from 0.5 to 1 (no dramatic 0.3)
  const scale = interpolate(entranceProgress, [0, 1], [0.5, 1]);

  // Opacity fade in
  const opacity = interpolate(entranceProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Exit fade in last 10 frames - updated for 150 frame duration
  const exitOpacity = frame > 140
    ? interpolate(frame, [140, 150], [1, 0], { extrapolateRight: 'clamp' })
    : 1;

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -60%) scale(${scale})`,
        opacity: opacity * exitOpacity,
        pointerEvents: 'none',
      }}
    >
      <RainbowLogoContainer logoSize={100} frame={frame} />
    </div>
  );
}

// ============================================================================
// 2D Text Overlay (Tagline and subtitle)
// ============================================================================

function TextOverlay() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Tagline entrance - delayed
  const taglineProgress = spring({
    frame: frame - 35,
    fps,
    config: { damping: 200 },
    durationInFrames: 30,
  });

  // Subtitle entrance - more delayed
  const subtitleProgress = spring({
    frame: frame - 50,
    fps,
    config: { damping: 200 },
    durationInFrames: 25,
  });

  // Tagline animations
  const taglineOpacity = interpolate(taglineProgress, [0, 1], [0, 1]);
  const taglineY = interpolate(taglineProgress, [0, 1], [30, 0]);

  // Subtitle animations
  const subtitleOpacity = interpolate(subtitleProgress, [0, 1], [0, 1]);

  // Exit fade in last 10 frames - updated for 150 frame duration
  const exitFade = frame > 140
    ? interpolate(frame, [140, 150], [1, 0], { extrapolateRight: 'clamp' })
    : 1;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 180,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        opacity: exitFade,
      }}
    >
      {/* Tagline */}
      <div
        style={{
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
  );
}

// ============================================================================
// Main Scene Component
// ============================================================================

export function Scene01Intro() {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BACKGROUNDS.primary,
        overflow: 'hidden',
      }}
    >
      {/* Background depth particles (subtle 2D) */}
      <DepthParticles
        frame={frame}
        count={25}
        baseOpacity={0.1}
        blur={25}
        intensity={1.0}
      />

      {/* Rainbow glow orbs for background (replaces single-color glow) */}
      <RainbowGlowOrbs
        frame={frame}
        orbs={[
          { top: 30, left: 25, size: 500, colorIndex: 0, opacity: 0.15, blur: 80 },
          { top: 45, right: 20, size: 400, colorIndex: 6, opacity: 0.12, blur: 70 },
          { bottom: 20, left: 35, size: 350, colorIndex: 3, opacity: 0.1, blur: 75 },
        ]}
      />

      {/* Logo overlay (HTML) */}
      <LogoOverlay />

      {/* Text overlay (tagline + subtitle) */}
      <TextOverlay />

      {/* Edge vignette for cinematic feel */}
      <EdgeVignette innerRadius={50} edgeOpacity={0.4} />
    </AbsoluteFill>
  );
}
