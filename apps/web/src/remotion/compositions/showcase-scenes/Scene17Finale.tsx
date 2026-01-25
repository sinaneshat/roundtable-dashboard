/**
 * Scene 17: Grand Finale
 * Duration: 27-30s (90 frames at 30fps)
 *
 * Camera: Epic 3D zoom out, orbit rotation around interface
 * Content: Full interface visible, rainbow gradient border, logo center
 * Text: "roundtable.now" + "Start your council today" + CTA button
 * Music: Final beat, reverb tail
 *
 * 3D Camera Effects:
 * - Dramatic camera pull-back (z=200 to z=0)
 * - Orbit rotation around logo (subtle Y rotation)
 * - Depth layers: background z=-200, logo z=100, CTA z=50
 * - Depth blur on background elements
 * - 3D flip entrance for CTA button
 */

import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

import { EdgeVignette, RainbowLogoContainer } from '../../components/scene-primitives';
import { VideoButton } from '../../components/ui-replicas';
import { createFocusTransition, useCinematicCamera } from '../../hooks';
import { BACKGROUNDS, HEX_COLORS, SPACING, TEXT, TYPOGRAPHY } from '../../lib/design-tokens';

// Constants for 3D depth layers
const DEPTH_LAYERS = {
  background: -200,
  glow: -100,
  logo: 100,
  cta: 50,
  tagline: 25,
} as const;

const PERSPECTIVE = 2000;

// ============================================================================

export function Scene17Finale() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // === CAMERA SYSTEM - NO 3D SKEW FOR FINALE ===

  // Simple camera pull-back for depth, NO rotation
  const cameraZ = interpolate(frame, [0, 90], [100, 0], {
    extrapolateRight: 'clamp',
  });

  // NO orbit rotation - keep finale flat and centered
  const orbitY = 0;
  const orbitX = 0;

  // === CINEMATIC CAMERA (existing breathing) ===
  useCinematicCamera({
    movement: 'zoom-out',
    startFrame: 0,
    duration: 90,
    intensity: 0.6,
    breathingEnabled: true,
    breathingIntensity: 8,
    orbitSpeed: 0.008,
  });

  // Focus pull for dramatic reveal
  const { filter: focusFilter } = createFocusTransition({
    frame,
    startFrame: 0,
    duration: 35,
    maxBlur: 15,
  });

  // === LOGO ANIMATION ===
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

  // Exit fade in last 10 frames
  const exitFade = frame > 140
    ? interpolate(frame, [140, 150], [1, 0], { extrapolateRight: 'clamp' })
    : 1;

  // === CTA 3D FLIP ENTRANCE ===
  const ctaFlipProgress = spring({
    frame: frame - 60,
    fps,
    config: { damping: 15, stiffness: 100, mass: 1 },
    durationInFrames: 30,
  });

  // Flip from below (rotateX from 90deg to 0deg)
  const ctaRotateX = interpolate(ctaFlipProgress, [0, 1], [Math.PI / 2, 0]);
  const ctaOpacity = interpolate(ctaFlipProgress, [0, 0.3], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const ctaScale = interpolate(ctaFlipProgress, [0, 1], [0.8, 1]);

  // CTA button - no pulsation, static after entrance
  const ctaPulse = 1;

  // === TAGLINE ENTRANCE ===
  const taglineProgress = spring({
    frame: frame - 70,
    fps,
    config: { damping: 200 },
    durationInFrames: 25,
  });

  const taglineOpacity = interpolate(taglineProgress, [0, 1], [0, 1]);
  const taglineY = interpolate(taglineProgress, [0, 1], [20, 0]);

  // Calculate effective Z position with camera offset
  const getEffectiveZ = (layerZ: number) => layerZ - cameraZ;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BACKGROUNDS.primary,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        perspective: PERSPECTIVE,
        perspectiveOrigin: '50% 50%',
      }}
    >
      {/* 3D Scene Container - applies camera orbit */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transformStyle: 'preserve-3d',
          transform: `rotateY(${orbitY}rad) rotateX(${orbitX}rad)`,
        }}
      >
        {/* Background effects removed for cleaner look */}

        {/* Edge vignette - at scene level */}
        <EdgeVignette innerRadius={50} edgeOpacity={0.5} />

        {/* Subtle glow behind logo - neutral, no color cast */}
        <div
          style={{
            position: 'absolute',
            width: 800,
            height: 800,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 50%)`,
            filter: `blur(80px)`,
            opacity: logoOpacity * 0.5,
            transformStyle: 'preserve-3d',
            transform: `translateZ(${getEffectiveZ(DEPTH_LAYERS.glow)}px)`,
          }}
        />

        {/* === LOGO LAYER (z=100) - Main content with rainbow border === */}
        <div
          style={{
            transformStyle: 'preserve-3d',
            transform: `translateZ(${getEffectiveZ(DEPTH_LAYERS.logo)}px) scale(${logoScale})`,
            opacity: logoOpacity * exitFade,
            filter: focusFilter,
          }}
        >
          <RainbowLogoContainer logoSize={120} frame={frame} />
        </div>

        {/* === CTA LAYER (z=50) - 3D Flip Entrance === */}
        <div
          style={{
            marginTop: SPACING.xl,
            transformStyle: 'preserve-3d',
            transform: `translateZ(${getEffectiveZ(DEPTH_LAYERS.cta)}px)`,
            perspective: 1000,
          }}
        >
          <div
            style={{
              opacity: ctaOpacity * exitFade,
              transform: `rotateX(${ctaRotateX}rad) scale(${ctaScale * ctaPulse})`,
              transformOrigin: 'center bottom',
              backfaceVisibility: 'hidden',
            }}
          >
            <VideoButton
              variant="white"
              size="lg"
              style={{
                fontSize: 28,
                padding: '20px 56px',
                borderRadius: 20,
                boxShadow: `
                  0 10px 40px rgba(255, 255, 255, 0.2),
                  0 5px 20px rgba(0, 0, 0, 0.3)
                `,
              }}
            >
              Try Free Today
            </VideoButton>
          </div>
        </div>

        {/* === TAGLINE LAYER (z=25) === */}
        <div
          style={{
            marginTop: SPACING.lg,
            transformStyle: 'preserve-3d',
            transform: `translateZ(${getEffectiveZ(DEPTH_LAYERS.tagline)}px) translateY(${taglineY}px)`,
            opacity: taglineOpacity * exitFade,
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
      </div>

      {/* Fade to black at the very end - outside 3D container */}
      {frame > 135 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: HEX_COLORS.black,
            opacity: interpolate(frame, [135, 150], [0, 1], {
              extrapolateRight: 'clamp',
            }),
            zIndex: 100,
          }}
        />
      )}
    </AbsoluteFill>
  );
}
