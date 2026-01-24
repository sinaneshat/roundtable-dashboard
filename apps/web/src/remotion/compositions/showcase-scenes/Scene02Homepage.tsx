/**
 * Scene 2: Homepage Hero
 * Duration: 2-4s (90 frames at 30fps)
 *
 * Camera: Slow dolly right across homepage with subtle zoom
 * Content: Homepage hero section with gradient mesh background
 * 3D Effect: Floating UI cards at different z-depths with blur
 *
 * Cinematic Effects:
 * - Dolly right camera movement with breathing
 * - Multi-depth parallax layers (0.3x, 0.5x, 0.8x, 1.0x)
 * - Focus pull on hero content
 * - Subtle zoom during dolly
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

export function Scene02Homepage() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BACKGROUNDS.primary,
        overflow: 'hidden',
        perspective: 1200,
        perspectiveOrigin: 'center center',
      }}
    >
      {/* Background depth particles - far layer with parallax */}
      <div
        style={{
          transform: `translate(${breathingOffset.x * 0.2}px, ${breathingOffset.y * 0.2}px)`,
        }}
      >
        <DepthParticles frame={frame} baseOpacity={0.35} count={20} />
      </div>

      {/* Edge vignette */}
      <EdgeVignette innerRadius={50} edgeOpacity={0.5} />

      {/* Main content with camera transform + dolly movement */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translateX(${dollyX}px) scale(${zoomScale})`,
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

      {/* Floating participant chat cards at different depths with enhanced parallax */}
      {/* Far depth layer - Claude (top-left) */}
      <div
        style={{
          position: 'absolute',
          top: '12%',
          left: '4%',
          filter: 'blur(6px)',
          opacity: 0.45,
          transform: `translateY(${cardFloatY * 0.4}px) translateX(${dollyX * 0.2 + breathingOffset.x * 0.2}px)`,
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

      {/* Mid depth layer - GPT-4o (bottom-right) */}
      <div
        style={{
          position: 'absolute',
          bottom: '18%',
          right: '6%',
          filter: 'blur(3px)',
          opacity: 0.65,
          transform: `translateY(${cardFloatY * 0.6}px) translateX(${dollyX * 0.45 + breathingOffset.x * 0.4}px)`,
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

      {/* Near depth layer - Gemini (top-right) */}
      <div
        style={{
          position: 'absolute',
          top: '22%',
          right: '10%',
          filter: 'blur(1px)',
          opacity: 0.85,
          transform: `translateY(${cardFloatY * 0.85}px) translateX(${dollyX * 0.7 + breathingOffset.x * 0.6}px)`,
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

      {/* Foreground layer - DeepSeek (bottom-left) */}
      <div
        style={{
          position: 'absolute',
          bottom: '32%',
          left: '8%',
          opacity: 0.95,
          transform: `translateY(${cardFloatY}px) translateX(${dollyX * 0.9 + breathingOffset.x * 0.8}px)`,
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

      {/* Feature captions overlay */}
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
