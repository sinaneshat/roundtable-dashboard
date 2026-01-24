/**
 * Scene 17: Grand Finale
 * Duration: 27-30s (90 frames at 30fps)
 *
 * Camera: Epic zoom out, 3D rotation around interface
 * Content: Full interface visible, rainbow gradient border, logo center
 * Text: "roundtable.now" + "Start your council today" + CTA button
 * Music: Final beat, reverb tail
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

import { DepthParticles, EdgeVignette } from '../../components/scene-primitives';
import { VideoButton } from '../../components/ui-replicas';
import { useCinematicCamera, useFocusTransition } from '../../hooks';
import { BACKGROUNDS, BRAND, RAINBOW, SPACING, TEXT, TYPOGRAPHY } from '../../lib/design-tokens';

export function Scene17Finale() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // === CINEMATIC CAMERA ===
  // Epic zoom-out reveal with breathing
  const { breathingOffset } = useCinematicCamera({
    movement: 'zoom-out',
    startFrame: 0,
    duration: 90,
    intensity: 0.6,
    breathingEnabled: true,
    breathingIntensity: 4,
    orbitSpeed: 0.008,
  });

  // Focus pull for dramatic reveal
  const { filter: focusFilter } = useFocusTransition({
    frame,
    startFrame: 0,
    duration: 35,
    maxBlur: 15,
  });

  // Logo entrance - dramatic scale
  const logoProgress = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 100, mass: 0.9 },
    durationInFrames: 35,
  });

  const logoScale = interpolate(logoProgress, [0, 1], [0.5, 1]);
  const logoOpacity = interpolate(logoProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // URL text entrance
  const urlProgress = spring({
    frame: frame - 25,
    fps,
    config: { damping: 200 },
    durationInFrames: 25,
  });

  const urlOpacity = interpolate(urlProgress, [0, 1], [0, 1]);
  const urlY = interpolate(urlProgress, [0, 1], [30, 0]);

  // CTA entrance
  const ctaProgress = spring({
    frame: frame - 40,
    fps,
    config: { damping: 200 },
    durationInFrames: 25,
  });

  const ctaOpacity = interpolate(ctaProgress, [0, 1], [0, 1]);
  const ctaScale = interpolate(ctaProgress, [0, 1], [0.9, 1]);

  // Tagline entrance
  const taglineProgress = spring({
    frame: frame - 55,
    fps,
    config: { damping: 200 },
    durationInFrames: 25,
  });

  const taglineOpacity = interpolate(taglineProgress, [0, 1], [0, 1]);

  // Rainbow border rotation - faster for finale
  const glowRotation = interpolate(frame, [0, 90], [0, 360]);

  // Glow pulse effect
  const glowPulse = Math.sin(frame * 0.15) * 0.3 + 0.7;

  // CTA button pulse
  const ctaPulse = frame > 50 ? Math.sin((frame - 50) * 0.2) * 0.05 + 1 : 1;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BACKGROUNDS.primary,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        perspective: 1500,
        perspectiveOrigin: 'center center',
      }}
    >
      {/* Background depth particles - with breathing parallax */}
      <div
        style={{
          transform: `translate(${breathingOffset.x * 0.3}px, ${breathingOffset.y * 0.3}px)`,
        }}
      >
        <DepthParticles frame={frame} count={20} baseOpacity={0.35} />
      </div>

      {/* Edge vignette */}
      <EdgeVignette innerRadius={50} edgeOpacity={0.4} />

      {/* Central glow - with breathing parallax */}
      <div
        style={{
          position: 'absolute',
          width: 1000,
          height: 1000,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${BRAND.colors.primary}40 0%, transparent 60%)`,
          filter: 'blur(80px)',
          opacity: logoOpacity * glowPulse,
          transform: `translate(${breathingOffset.x * 0.15}px, ${breathingOffset.y * 0.15}px)`,
        }}
      />

      {/* Logo with rainbow border - cinematic focus */}
      <div
        style={{
          transform: `scale(${logoScale})`,
          opacity: logoOpacity,
          filter: focusFilter,
        }}
      >
        <div
          style={{
            position: 'relative',
            padding: 6,
            borderRadius: 40,
            background: `linear-gradient(${glowRotation}deg, ${RAINBOW.colors.join(', ')})`,
            boxShadow: `0 0 80px ${BRAND.colors.primary}50, 0 0 120px ${BRAND.colors.primary}30`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 28,
              padding: '32px 56px',
              borderRadius: 36,
              backgroundColor: BACKGROUNDS.primary,
            }}
          >
            <Img
              src={staticFile('static/logo.webp')}
              width={120}
              height={120}
              style={{ objectFit: 'contain' }}
            />
            <span
              style={{
                fontSize: 80,
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

      {/* URL with gradient text - cinematic focus */}
      <div
        style={{
          marginTop: SPACING.xl,
          opacity: urlOpacity,
          transform: `translateY(${urlY}px)`,
          filter: focusFilter,
        }}
      >
        <span
          style={{
            fontSize: 36,
            fontWeight: 600,
            background: `linear-gradient(90deg, ${RAINBOW.colors.slice(0, 4).join(', ')})`,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontFamily: '\'Noto Sans\', system-ui, sans-serif',
          }}
        >
          roundtable.now
        </span>
      </div>

      {/* CTA Button - cinematic focus */}
      <div
        style={{
          marginTop: SPACING.lg,
          opacity: ctaOpacity,
          transform: `scale(${ctaScale * ctaPulse})`,
          filter: focusFilter,
        }}
      >
        <VideoButton
          variant="white"
          size="lg"
          style={{
            fontSize: 20,
            padding: '16px 40px',
            borderRadius: 16,
            boxShadow: '0 10px 40px rgba(255, 255, 255, 0.2)',
          }}
        >
          Try Free Today
        </VideoButton>
      </div>

      {/* Tagline - cinematic focus */}
      <div
        style={{
          marginTop: SPACING.xl,
          opacity: taglineOpacity,
          filter: focusFilter,
        }}
      >
        <span
          style={{
            ...TYPOGRAPHY.body,
            color: TEXT.muted,
          }}
        >
          Start your council today
        </span>
      </div>

      {/* Fade to black at the very end */}
      {frame > 75 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#000000',
            opacity: interpolate(frame, [75, 90], [0, 1], {
              extrapolateRight: 'clamp',
            }),
          }}
        />
      )}
    </AbsoluteFill>
  );
}
