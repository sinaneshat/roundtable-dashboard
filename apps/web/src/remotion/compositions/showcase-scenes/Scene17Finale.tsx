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

import { DepthParticles, EdgeVignette, RainbowLogoContainer } from '../../components/scene-primitives';
import { VideoButton } from '../../components/ui-replicas';
import { useCinematicCamera, useFocusTransition } from '../../hooks';
import { BACKGROUNDS, BRAND, HEX_COLORS, RAINBOW, SPACING, TEXT, TYPOGRAPHY } from '../../lib/design-tokens';

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
  const { breathingOffset } = useCinematicCamera({
    movement: 'zoom-out',
    startFrame: 0,
    duration: 90,
    intensity: 0.6,
    breathingEnabled: true,
    breathingIntensity: 8,
    orbitSpeed: 0.008,
  });

  // Focus pull for dramatic reveal
  const { filter: focusFilter } = useFocusTransition({
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

  // Glow pulse effect
  const glowPulse = Math.sin(frame * 0.15) * 0.3 + 0.7;

  // === DEPTH BLUR CALCULATION ===
  // Background elements get more blur as camera pulls back
  const backgroundBlur = interpolate(frame, [0, 60], [15, 8], {
    extrapolateRight: 'clamp',
  });

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
        {/* === BACKGROUND LAYER (z=-200) === */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transformStyle: 'preserve-3d',
            transform: `translateZ(${getEffectiveZ(DEPTH_LAYERS.background)}px)`,
            filter: `blur(${backgroundBlur}px)`,
          }}
        >
          {/* Background depth particles - with breathing parallax */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              transform: `translate(${breathingOffset.x * 0.3}px, ${breathingOffset.y * 0.3}px)`,
            }}
          >
            <DepthParticles frame={frame} count={25} baseOpacity={0.15} />
          </div>

          {/* Background glow orbs for depth - varied rainbow colors */}
          <div
            style={{
              position: 'absolute',
              top: '20%',
              left: '15%',
              width: 400,
              height: 400,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${RAINBOW.colors[0]}20 0%, transparent 70%)`,
              filter: 'blur(40px)',
              opacity: 0.5,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '25%',
              right: '10%',
              width: 300,
              height: 300,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${RAINBOW.colors[6]}18 0%, transparent 70%)`,
              filter: 'blur(30px)',
              opacity: 0.45,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '60%',
              left: '5%',
              width: 250,
              height: 250,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${RAINBOW.colors[3]}15 0%, transparent 70%)`,
              filter: 'blur(35px)',
              opacity: 0.35,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '10%',
              right: '20%',
              width: 350,
              height: 350,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${RAINBOW.colors[9]}15 0%, transparent 70%)`,
              filter: 'blur(45px)',
              opacity: 0.4,
            }}
          />
        </div>

        {/* Edge vignette - at scene level */}
        <EdgeVignette innerRadius={50} edgeOpacity={0.5} />

        {/* === GLOW LAYER (z=-100) === */}
        <div
          style={{
            position: 'absolute',
            width: 1200,
            height: 1200,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${BRAND.colors.primary}35 0%, transparent 55%)`,
            filter: `blur(100px)`,
            opacity: logoOpacity * glowPulse * 0.8,
            transformStyle: 'preserve-3d',
            transform: `translateZ(${getEffectiveZ(DEPTH_LAYERS.glow)}px) translate(${breathingOffset.x * 0.15}px, ${breathingOffset.y * 0.15}px)`,
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
