/**
 * Scene 2: Homepage Hero
 * Duration: 2-4s (90 frames at 30fps)
 *
 * Camera: Slow dolly right across homepage with subtle zoom
 * Content: Homepage hero section with gradient mesh background
 *
 * Cinematic Effects:
 * - Dolly right camera movement with breathing
 * - Multi-depth parallax layers (0.3x, 0.5x, 0.8x, 1.0x)
 * - Focus pull on hero content
 * - Subtle zoom during dolly
 *
 * 3D Camera Effects (CSS 3D transforms):
 * - 3D perspective wrapper (perspective: 1200px)
 * - Camera dolly effect (translateZ animation: -200px -> 0)
 * - Depth blur - elements further from camera get blurry
 * - Parallax depth layers with different translateZ values:
 *   - Background: translateZ(-100px)
 *   - Mid-far: translateZ(-60px)
 *   - Mid-near: translateZ(-30px)
 *   - Foreground: translateZ(50px)
 * - Camera tilt entrance (rotateX: -5deg -> 0deg)
 */

import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

import { DepthParticles, EdgeVignette } from '../../components/scene-primitives';
import { VideoAvatar, VideoFeatureCaptions, VideoGlassCard, VideoLogo } from '../../components/ui-replicas';
import { useCinematicCamera, useFocusPull } from '../../hooks';
import { BACKGROUNDS, FONTS, SPACING, TEXT } from '../../lib/design-tokens';

// Role types and colors matching actual app (from packages/shared/src/enums/roles.ts)
type RoleName = 'Ideator' | 'Strategist' | 'Analyst' | 'Builder' | 'Critic';
type RoleColors = { bg: string; text: string; border: string };

const ROLE_COLORS: Record<RoleName, RoleColors> = {
  Ideator: { bg: 'rgba(34, 197, 94, 0.2)', text: '#4ade80', border: 'rgba(34, 197, 94, 0.3)' },
  Strategist: { bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' },
  Analyst: { bg: 'rgba(6, 182, 212, 0.2)', text: '#22d3ee', border: 'rgba(6, 182, 212, 0.3)' },
  Builder: { bg: 'rgba(249, 115, 22, 0.2)', text: '#fb923c', border: 'rgba(249, 115, 22, 0.3)' },
  Critic: { bg: 'rgba(236, 72, 153, 0.2)', text: '#f472b6', border: 'rgba(236, 72, 153, 0.3)' },
};

// Floating participant cards with messages
type FloatingParticipant = {
  provider: string;
  name: string;
  role: RoleName;
  message: string;
};

const CLAUDE_CARD: FloatingParticipant = {
  provider: 'anthropic',
  name: 'Claude',
  role: 'Analyst',
  message: 'I\'d recommend a phased approach...',
};

const GPT4O_CARD: FloatingParticipant = {
  provider: 'openai',
  name: 'GPT-4o',
  role: 'Strategist',
  message: 'Building on that, consider the user journey...',
};

const GEMINI_CARD: FloatingParticipant = {
  provider: 'google',
  name: 'Gemini',
  role: 'Ideator',
  message: 'Looking at market data, I found...',
};

const DEEPSEEK_CARD: FloatingParticipant = {
  provider: 'deepseek',
  name: 'DeepSeek',
  role: 'Builder',
  message: 'Here\'s an innovative alternative...',
};

// 3D depth layer z-offsets for parallax effect
const DEPTH_LAYERS = {
  background: -100, // Furthest from camera
  midFar: -60, // Mid-far layer
  midNear: -30, // Mid-near layer
  foreground: 50, // Closest to camera, in front of main content
} as const;

// Calculate depth blur based on z-position distance from camera
function getDepthBlur(zOffset: number, cameraZ: number): string {
  const effectiveDistance = Math.abs(zOffset - cameraZ);
  // Scale blur: further objects get more blur (max 8px)
  const blurAmount = Math.min(effectiveDistance * 0.04, 8);
  return blurAmount > 0.5 ? `blur(${blurAmount}px)` : 'none';
}

export function Scene02Homepage() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // === 3D CAMERA EFFECTS ===
  // Camera tilt entrance: starts tilted down, rotates to level
  const cameraTiltX = interpolate(frame, [0, 40], [-5, 0], {
    extrapolateRight: 'clamp',
  });

  // Camera dolly Z: pull back then push in (creates depth reveal)
  const cameraZ = interpolate(frame, [0, 60], [-200, 0], {
    extrapolateRight: 'clamp',
  });

  // Subtle camera Y rotation for added dimension
  const cameraRotateY = interpolate(frame, [0, 90], [-2, 2], {
    extrapolateRight: 'clamp',
  });

  // === CINEMATIC CAMERA ===
  // Dolly right with subtle zoom
  const { breathingOffset } = useCinematicCamera({
    movement: 'dolly-right',
    startFrame: 0,
    duration: 90,
    intensity: 0.8,
    breathingEnabled: true,
    breathingIntensity: 3,
  });

  // Focus pull - blur to sharp
  const { filter: focusFilter } = useFocusPull({
    startFrame: 0,
    duration: 20,
    maxBlur: 6,
  });

  // Enhanced dolly with camera position
  const dollyX = interpolate(frame, [0, 90], [80, -80], {
    extrapolateRight: 'clamp',
  });

  // Enhanced zoom during dolly
  const zoomScale = interpolate(frame, [0, 90], [1, 1.08], {
    extrapolateRight: 'clamp',
  });

  // Hero text entrance
  const heroProgress = spring({
    frame,
    fps,
    config: { damping: 30, stiffness: 150 },
    durationInFrames: 25,
  });

  const heroOpacity = interpolate(heroProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const heroY = interpolate(heroProgress, [0, 1], [40, 0]);

  // Subtitle entrance - delayed
  const subtitleProgress = spring({
    frame: frame - 15,
    fps,
    config: { damping: 200 },
    durationInFrames: 20,
  });

  const subtitleOpacity = interpolate(subtitleProgress, [0, 1], [0, 1]);

  // Exit fade in last 10 frames
  const exitFade = frame > 80
    ? interpolate(frame, [80, 90], [1, 0], { extrapolateRight: 'clamp' })
    : 1;

  // Feature cards floating effect - enhanced with breathing
  const cardFloatY = Math.sin(frame * 0.08) * 8 + breathingOffset.y * 0.5;

  // Card entrance stagger for 3D depth reveal
  const cardEntranceProgress = (delay: number) =>
    spring({
      frame: frame - delay,
      fps,
      config: { damping: 35, stiffness: 120 },
      durationInFrames: 30,
    });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BACKGROUNDS.primary,
        overflow: 'hidden',
        // 3D perspective setup for camera effects
        perspective: 1200,
        perspectiveOrigin: '50% 50%',
      }}
    >
      {/* 3D Camera Wrapper - applies tilt and dolly Z */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transformStyle: 'preserve-3d',
          transform: `
            rotateX(${cameraTiltX}deg)
            rotateY(${cameraRotateY}deg)
            translateZ(${cameraZ}px)
          `,
          transformOrigin: '50% 50%',
        }}
      >
        {/* Background depth particles - far layer with parallax + 3D depth */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `
              translate(${breathingOffset.x * 0.2}px, ${breathingOffset.y * 0.2}px)
              translateZ(${DEPTH_LAYERS.background}px)
            `,
            filter: getDepthBlur(DEPTH_LAYERS.background, cameraZ),
            transformStyle: 'preserve-3d',
          }}
        >
          <DepthParticles frame={frame} baseOpacity={0.12} count={20} />
        </div>

        {/* Edge vignette - stays at camera plane */}
        <EdgeVignette innerRadius={50} edgeOpacity={0.5} />

        {/* Main content with camera transform + dolly movement */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translateX(${dollyX}px) scale(${zoomScale}) translateZ(0px)`,
            transformStyle: 'preserve-3d',
            filter: focusFilter,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: SPACING.lg,
            opacity: exitFade,
          }}
        >
          {/* Logo */}
          <div
            style={{
              opacity: heroOpacity,
              transform: `translateY(${heroY}px)`,
              marginBottom: SPACING.xl,
            }}
          >
            <VideoLogo size="lg" showText />
          </div>

          {/* Hero headline */}
          <div
            style={{
              opacity: heroOpacity,
              transform: `translateY(${heroY}px)`,
            }}
          >
            <h1
              style={{
                fontSize: 64,
                fontWeight: 700,
                color: TEXT.primary,
                textAlign: 'center',
                margin: 0,
                fontFamily: FONTS.sans,
                lineHeight: 1.2,
              }}
            >
              Meet the AI Council
            </h1>
          </div>

          {/* Subtitle */}
          <div
            style={{
              marginTop: SPACING.lg,
              opacity: subtitleOpacity,
            }}
          >
            <p
              style={{
                fontSize: 24,
                color: TEXT.secondary,
                textAlign: 'center',
                margin: 0,
                fontFamily: FONTS.sans,
              }}
            >
              Multiple AI models. One conversation. Better answers.
            </p>
          </div>
        </div>

        {/* Floating participant chat cards at different 3D depths with enhanced parallax */}
        {/* Far depth layer - Claude (top-left) - translateZ(-100px) */}
        <div
          style={{
            position: 'absolute',
            top: '12%',
            left: '4%',
            filter: getDepthBlur(DEPTH_LAYERS.background, cameraZ),
            opacity: interpolate(cardEntranceProgress(5), [0, 1], [0, 0.5]),
            transform: `
              translateY(${cardFloatY * 0.4}px)
              translateX(${dollyX * 0.2 + breathingOffset.x * 0.2}px)
              translateZ(${DEPTH_LAYERS.background}px)
              scale(${interpolate(cardEntranceProgress(5), [0, 1], [0.8, 1])})
            `,
            transformStyle: 'preserve-3d',
          }}
        >
          <VideoGlassCard variant="subtle" style={{ padding: 14, width: 220 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <VideoAvatar provider={CLAUDE_CARD.provider} fallback={CLAUDE_CARD.name} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: TEXT.muted }}>{CLAUDE_CARD.name}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      padding: '2px 8px',
                      borderRadius: 9999,
                      backgroundColor: ROLE_COLORS[CLAUDE_CARD.role].bg,
                      color: ROLE_COLORS[CLAUDE_CARD.role].text,
                      border: `1px solid ${ROLE_COLORS[CLAUDE_CARD.role].border}`,
                    }}
                  >
                    {CLAUDE_CARD.role}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: TEXT.muted, lineHeight: 1.4 }}>{CLAUDE_CARD.message}</span>
              </div>
            </div>
          </VideoGlassCard>
        </div>

        {/* Mid-far depth layer - GPT-4o (bottom-right) - translateZ(-60px) */}
        <div
          style={{
            position: 'absolute',
            bottom: '18%',
            right: '6%',
            filter: getDepthBlur(DEPTH_LAYERS.midFar, cameraZ),
            opacity: interpolate(cardEntranceProgress(10), [0, 1], [0, 0.7]),
            transform: `
              translateY(${cardFloatY * 0.6}px)
              translateX(${dollyX * 0.45 + breathingOffset.x * 0.4}px)
              translateZ(${DEPTH_LAYERS.midFar}px)
              scale(${interpolate(cardEntranceProgress(10), [0, 1], [0.85, 1])})
            `,
            transformStyle: 'preserve-3d',
          }}
        >
          <VideoGlassCard variant="medium" style={{ padding: 14, width: 240 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <VideoAvatar provider={GPT4O_CARD.provider} fallback={GPT4O_CARD.name} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: TEXT.muted }}>{GPT4O_CARD.name}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      padding: '2px 8px',
                      borderRadius: 9999,
                      backgroundColor: ROLE_COLORS[GPT4O_CARD.role].bg,
                      color: ROLE_COLORS[GPT4O_CARD.role].text,
                      border: `1px solid ${ROLE_COLORS[GPT4O_CARD.role].border}`,
                    }}
                  >
                    {GPT4O_CARD.role}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: TEXT.muted, lineHeight: 1.4 }}>{GPT4O_CARD.message}</span>
              </div>
            </div>
          </VideoGlassCard>
        </div>

        {/* Mid-near depth layer - Gemini (top-right) - translateZ(-30px) */}
        <div
          style={{
            position: 'absolute',
            top: '22%',
            right: '10%',
            filter: getDepthBlur(DEPTH_LAYERS.midNear, cameraZ),
            opacity: interpolate(cardEntranceProgress(15), [0, 1], [0, 0.88]),
            transform: `
              translateY(${cardFloatY * 0.85}px)
              translateX(${dollyX * 0.7 + breathingOffset.x * 0.6}px)
              translateZ(${DEPTH_LAYERS.midNear}px)
              scale(${interpolate(cardEntranceProgress(15), [0, 1], [0.9, 1])})
            `,
            transformStyle: 'preserve-3d',
          }}
        >
          <VideoGlassCard variant="strong" style={{ padding: 14, width: 250 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <VideoAvatar provider={GEMINI_CARD.provider} fallback={GEMINI_CARD.name} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: TEXT.muted }}>{GEMINI_CARD.name}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      padding: '2px 8px',
                      borderRadius: 9999,
                      backgroundColor: ROLE_COLORS[GEMINI_CARD.role].bg,
                      color: ROLE_COLORS[GEMINI_CARD.role].text,
                      border: `1px solid ${ROLE_COLORS[GEMINI_CARD.role].border}`,
                    }}
                  >
                    {GEMINI_CARD.role}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: TEXT.muted, lineHeight: 1.4 }}>{GEMINI_CARD.message}</span>
              </div>
            </div>
          </VideoGlassCard>
        </div>

        {/* Foreground layer - DeepSeek (bottom-left) - translateZ(+50px) - in front of camera */}
        <div
          style={{
            position: 'absolute',
            bottom: '32%',
            left: '8%',
            // Foreground gets slight blur as it's "too close" to camera
            filter: getDepthBlur(DEPTH_LAYERS.foreground, cameraZ),
            opacity: interpolate(cardEntranceProgress(20), [0, 1], [0, 0.98]),
            transform: `
              translateY(${cardFloatY}px)
              translateX(${dollyX * 0.9 + breathingOffset.x * 0.8}px)
              translateZ(${DEPTH_LAYERS.foreground}px)
              scale(${interpolate(cardEntranceProgress(20), [0, 1], [0.95, 1])})
            `,
            transformStyle: 'preserve-3d',
          }}
        >
          <VideoGlassCard variant="strong" style={{ padding: 14, width: 260 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <VideoAvatar provider={DEEPSEEK_CARD.provider} fallback={DEEPSEEK_CARD.name} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: TEXT.muted }}>{DEEPSEEK_CARD.name}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      padding: '2px 8px',
                      borderRadius: 9999,
                      backgroundColor: ROLE_COLORS[DEEPSEEK_CARD.role].bg,
                      color: ROLE_COLORS[DEEPSEEK_CARD.role].text,
                      border: `1px solid ${ROLE_COLORS[DEEPSEEK_CARD.role].border}`,
                    }}
                  >
                    {DEEPSEEK_CARD.role}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: TEXT.muted, lineHeight: 1.4 }}>{DEEPSEEK_CARD.message}</span>
              </div>
            </div>
          </VideoGlassCard>
        </div>
      </div>

      {/* Feature captions overlay - outside 3D wrapper */}
      <VideoFeatureCaptions
        position="bottom-left"
        captions={[
          { start: 0, end: 45, text: 'Meet the AI council', subtitle: 'Multiple models collaborate on your questions' },
          { start: 45, end: 90, text: 'Diverse perspectives', subtitle: 'Each AI brings unique reasoning and knowledge' },
        ]}
      />
    </AbsoluteFill>
  );
}
