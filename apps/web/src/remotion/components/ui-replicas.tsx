/**
 * Remotion UI Replicas
 *
 * EXACT CSS replicas of actual app components for Remotion video rendering.
 * All styles are copied directly from the source components.
 *
 * Source files:
 * - @/components/ui/avatar.tsx
 * - @/components/ui/button.tsx
 * - @/components/ai-elements/message.tsx
 * - @/components/chat/chat-message-list.tsx (user message bubble)
 * - @/components/chat/participant-header.tsx
 * - @/components/chat/model-message-card.tsx
 * - @/lib/ui/glassmorphism.ts
 * - @/lib/utils/ai-display.ts (getProviderIcon)
 * - @/styles/globals.css (dark theme CSS variables)
 */

import type { CSSProperties, ReactNode } from 'react';
import { Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

import { FONTS } from '../lib/design-tokens';

// ============================================================================
// Dark Theme Color Tokens
// Source: apps/web/src/styles/globals.css .dark {}
//
// OKLCH values (reference):
// --background: oklch(0.18 0 0)      -> #1a1a1a
// --foreground: oklch(0.87 0 0)      -> #dedede
// --card: oklch(0.22 0 0)            -> #282828
// --secondary: oklch(0.269 0 0)      -> #3a3a3a (user message bg)
// --secondary-foreground: oklch(0.87 0 0) -> #dedede
// --muted: oklch(0.269 0 0)          -> #3a3a3a
// --muted-foreground: oklch(0.75 0 0) -> #a3a3a3
// --border: oklch(0.4 0 0 / 60%)     -> rgba(77, 77, 77, 0.6)
// --primary: oklch(0.922 0 0)        -> #eaeaea
// ============================================================================

const COLORS = {
  background: '#1a1a1a',
  foreground: '#dedede',
  card: '#282828',
  secondary: '#3a3a3a', // User message background
  secondaryForeground: '#dedede',
  muted: '#3a3a3a',
  mutedForeground: '#a3a3a3',
  border: 'rgba(77, 77, 77, 0.6)',
  borderWhite12: 'rgba(255, 255, 255, 0.12)',
  borderWhite20: 'rgba(255, 255, 255, 0.2)',
  borderWhite30: 'rgba(255, 255, 255, 0.3)',
  primary60: 'rgba(234, 234, 234, 0.6)', // Streaming indicator
  white: '#ffffff',
  black: '#000000',
  blue500: '#3b82f6', // Voice recording
  purple500: '#a855f7', // Auto mode
} as const;

// ============================================================================
// TextShimmer Replica
// Source: @/components/ai-elements/shimmer.tsx
// Animation: Split text into character spans with staggered opacity wave
// Timing: 500ms duration, 50ms delay per char, 2s repeat delay
// ============================================================================

const SHIMMER_CONFIG = {
  INITIAL_OPACITY: 0.5,
  PEAK_OPACITY: 1,
  DURATION_FRAMES: 15, // 500ms at 30fps
  DELAY_PER_CHAR_FRAMES: 1.5, // 50ms at 30fps
  REPEAT_DELAY_FRAMES: 60, // 2s at 30fps
  NON_BREAKING_SPACE: '\u00A0',
} as const;

type VideoTextShimmerProps = {
  children: string;
  style?: CSSProperties;
};

export function VideoTextShimmer({ children, style }: VideoTextShimmerProps) {
  const frame = useCurrentFrame();

  // Total cycle length
  const totalCycleFrames = (children.length * SHIMMER_CONFIG.DELAY_PER_CHAR_FRAMES)
    + SHIMMER_CONFIG.DURATION_FRAMES
    + SHIMMER_CONFIG.REPEAT_DELAY_FRAMES;

  return (
    <span style={{ display: 'inline-flex', ...style }}>
      {children.split('').map((char, i) => {
        // Calculate where we are in the animation cycle
        const charDelay = i * SHIMMER_CONFIG.DELAY_PER_CHAR_FRAMES;
        const cycleFrame = (frame % totalCycleFrames) - charDelay;

        // Opacity animation: 0.5 → 1 → 0.5 over DURATION_FRAMES
        let opacity: number = SHIMMER_CONFIG.INITIAL_OPACITY;
        if (cycleFrame >= 0 && cycleFrame < SHIMMER_CONFIG.DURATION_FRAMES) {
          const halfDuration = SHIMMER_CONFIG.DURATION_FRAMES / 2;
          if (cycleFrame < halfDuration) {
            // Rising: 0.5 → 1
            opacity = interpolate(
              cycleFrame,
              [0, halfDuration],
              [SHIMMER_CONFIG.INITIAL_OPACITY, SHIMMER_CONFIG.PEAK_OPACITY],
            );
          } else {
            // Falling: 1 → 0.5
            opacity = interpolate(
              cycleFrame,
              [halfDuration, SHIMMER_CONFIG.DURATION_FRAMES],
              [SHIMMER_CONFIG.PEAK_OPACITY, SHIMMER_CONFIG.INITIAL_OPACITY],
            );
          }
        }

        return (
          <span
            key={`shimmer-${i}`}
            style={{
              display: 'inline-block',
              opacity,
              transition: 'none',
            }}
          >
            {char === ' ' ? SHIMMER_CONFIG.NON_BREAKING_SPACE : char}
          </span>
        );
      })}
    </span>
  );
}

// ============================================================================
// Participant Placeholder with Shimmer
// Source: @/components/chat/model-message-card.tsx
// Shows avatar + name with shimmer "Gathering thoughts..." text
// ============================================================================

type VideoParticipantPlaceholderProps = {
  modelName: string;
  provider?: string;
  avatarFallback?: string;
  loadingText?: string;
  isModerator?: boolean;
  role?: string;
  roleColor?: string;
};

export function VideoParticipantPlaceholder({
  modelName,
  provider,
  avatarFallback,
  loadingText = 'Gathering thoughts...',
  isModerator = false,
  role,
  roleColor,
}: VideoParticipantPlaceholderProps) {
  const wrapperStyles: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    width: '100%',
  };

  const headerStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  };

  const nameStyles: CSSProperties = {
    fontSize: 20,
    fontWeight: 600,
    color: COLORS.mutedForeground,
    fontFamily: FONTS.sans,
  };

  // Role badge: matches model-message-card.tsx Badge styling
  // "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
  const roleBadgeStyles: CSSProperties = role
    ? {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 500,
        border: `1px solid ${roleColor || COLORS.borderWhite20}`,
        color: roleColor || COLORS.mutedForeground,
        backgroundColor: roleColor ? `${roleColor}15` : 'transparent',
      }
    : {};

  const shimmerContainerStyles: CSSProperties = {
    fontSize: 14,
    color: COLORS.mutedForeground,
    fontFamily: FONTS.sans,
  };

  const finalAvatarSrc = isModerator
    ? staticFile('static/logo.webp')
    : undefined;

  return (
    <div style={wrapperStyles}>
      <div style={headerStyles}>
        <VideoAvatar
          src={finalAvatarSrc}
          provider={isModerator ? undefined : provider}
          fallback={avatarFallback || modelName}
          size={32}
        />
        <span style={nameStyles}>{modelName}</span>
        {role && <span style={roleBadgeStyles}>{role}</span>}
      </div>
      <div style={shimmerContainerStyles}>
        <VideoTextShimmer>{loadingText}</VideoTextShimmer>
      </div>
    </div>
  );
}

// ============================================================================
// Voice Recording Visualization
// Source: @/components/chat/voice-visualization.tsx
// Blue theme with animated bars, pulsing mic icon
// ============================================================================

type VideoVoiceVisualizationProps = {
  isActive: boolean;
  barCount?: number;
};

export function VideoVoiceVisualization({
  isActive,
  barCount = 40,
}: VideoVoiceVisualizationProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!isActive)
    return null;

  // Generate bar heights with animation
  const bars = Array.from({ length: barCount }, (_, i) => {
    const baseHeight = 30 + ((i * 17) % 50);
    const duration = 0.8 + ((i * 7) % 40) / 100;
    const durationFrames = duration * fps;

    // Animate height between min and max
    const minHeight = Math.max(20, baseHeight);
    const maxHeight = Math.max(20, (baseHeight + 30) % 100);

    // Oscillate within cycle
    const cycleProgress = ((frame + i * 0.6) % durationFrames) / durationFrames;
    const height = interpolate(
      Math.sin(cycleProgress * Math.PI * 2),
      [-1, 1],
      [minHeight, maxHeight],
    );

    return height;
  });

  // Mic icon pulse
  const pulseProgress = (frame % 45) / 45; // 1.5s cycle
  const micScale = interpolate(
    Math.sin(pulseProgress * Math.PI * 2),
    [-1, 1],
    [1, 1.2],
  );
  const micOpacity = interpolate(
    Math.sin(pulseProgress * Math.PI * 2),
    [-1, 1],
    [1, 0.8],
  );

  const containerStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px',
    borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    backdropFilter: 'blur(24px)',
  };

  const micContainerStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  };

  const micStyles: CSSProperties = {
    transform: `scale(${micScale})`,
    opacity: micOpacity,
  };

  const labelStyles: CSSProperties = {
    fontSize: 10,
    fontWeight: 500,
    color: COLORS.blue500,
    fontFamily: FONTS.sans,
  };

  const barsContainerStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    flex: 1,
    height: 24,
    minWidth: 0,
  };

  const hintStyles: CSSProperties = {
    fontSize: 10,
    color: 'rgba(59, 130, 246, 0.6)',
    flexShrink: 0,
    fontFamily: FONTS.sans,
  };

  return (
    <div style={containerStyles}>
      <div style={micContainerStyles}>
        <div style={micStyles}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={COLORS.blue500} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        </div>
        <span style={labelStyles}>Recording</span>
      </div>

      <div style={barsContainerStyles}>
        {bars.map((height, i) => (
          <div
            key={`bar-${i}`}
            style={{
              flex: 1,
              height: `${height}%`,
              backgroundColor: 'rgba(59, 130, 246, 0.6)',
              borderRadius: 9999,
              minWidth: 2,
            }}
          />
        ))}
      </div>

      <span style={hintStyles}>Click mic to stop</span>
    </div>
  );
}

// ============================================================================
// Chain of Thought Accordion
// Source: @/components/ai-elements/chain-of-thought.tsx
// Collapsible with chevron rotation, border/bg styling
// ============================================================================

type VideoAccordionProps = {
  title: string;
  isOpen: boolean;
  children: ReactNode;
  icon?: ReactNode;
};

export function VideoAccordion({ title, isOpen, children, icon }: VideoAccordionProps) {
  // Animate chevron rotation
  const chevronRotation = isOpen ? 180 : 0;

  // Animate content height (simplified - just opacity for Remotion)
  const contentOpacity = isOpen ? 1 : 0;

  const rootStyles: CSSProperties = {
    width: '100%',
    borderRadius: 16,
    border: '1px solid rgba(77, 77, 77, 0.5)',
    backgroundColor: 'rgba(58, 58, 58, 0.3)',
    overflow: 'hidden',
  };

  const headerStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '10px 12px',
    minHeight: 44,
    fontSize: 14,
    fontWeight: 500,
    color: COLORS.mutedForeground,
    fontFamily: FONTS.sans,
    cursor: 'pointer',
  };

  const titleContainerStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  };

  const chevronStyles: CSSProperties = {
    width: 16,
    height: 16,
    flexShrink: 0,
    marginLeft: 8,
    transform: `rotate(${chevronRotation}deg)`,
    transition: 'transform 0.2s ease',
  };

  const contentStyles: CSSProperties = {
    padding: isOpen ? '4px 12px 16px' : '0 12px',
    opacity: contentOpacity,
    display: isOpen ? 'block' : 'none',
  };

  return (
    <div style={rootStyles}>
      <div style={headerStyles}>
        <div style={titleContainerStyles}>
          {icon}
          <span>{title}</span>
        </div>
        <svg style={chevronStyles} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      <div style={contentStyles}>
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// Web Search Result Item
// Source: @/components/chat/web-search-result-item.tsx
// Shows domain, title, content preview with avatar
// ============================================================================

type VideoWebSearchResultProps = {
  domain: string;
  title: string;
  url: string;
  snippet?: string;
};

export function VideoWebSearchResult({ domain, title, snippet }: VideoWebSearchResultProps) {
  const itemStyles: CSSProperties = {
    padding: '12px 0',
    borderBottom: '1px solid rgba(77, 77, 77, 0.1)',
  };

  const headerStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  };

  const avatarStyles: CSSProperties = {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: COLORS.muted,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    color: COLORS.mutedForeground,
    flexShrink: 0,
  };

  const titleStyles: CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
    color: COLORS.foreground,
    fontFamily: FONTS.sans,
  };

  const domainStyles: CSSProperties = {
    fontSize: 12,
    color: COLORS.mutedForeground,
    fontFamily: FONTS.sans,
  };

  const snippetStyles: CSSProperties = {
    fontSize: 12,
    color: COLORS.mutedForeground,
    lineHeight: 1.5,
    marginTop: 4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    fontFamily: FONTS.sans,
  };

  return (
    <div style={itemStyles}>
      <div style={headerStyles}>
        <div style={avatarStyles}>{domain[0]?.toUpperCase()}</div>
        <span style={domainStyles}>{domain}</span>
      </div>
      <div style={titleStyles}>{title}</div>
      {snippet && <div style={snippetStyles}>{snippet}</div>}
    </div>
  );
}

// ============================================================================
// Model Preset Card
// Source: @/components/chat/model-preset-card.tsx
// Card showing preset name, description, and included models
// ============================================================================

type VideoModelPresetCardProps = {
  name: string;
  description: string;
  models: Array<{ provider: string; name: string }>;
  isSelected?: boolean;
};

export function VideoModelPresetCard({ name, description, models, isSelected = false }: VideoModelPresetCardProps) {
  const cardStyles: CSSProperties = {
    padding: 16,
    borderRadius: 12,
    border: isSelected ? '2px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)', // White borders, not purple
    backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
    cursor: 'pointer',
  };

  const nameStyles: CSSProperties = {
    fontSize: 16,
    fontWeight: 600,
    color: COLORS.foreground,
    marginBottom: 4,
    fontFamily: FONTS.sans,
  };

  const descStyles: CSSProperties = {
    fontSize: 12,
    color: COLORS.mutedForeground,
    marginBottom: 12,
    fontFamily: FONTS.sans,
  };

  const modelsContainerStyles: CSSProperties = {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  };

  return (
    <div style={cardStyles}>
      <div style={nameStyles}>{name}</div>
      <div style={descStyles}>{description}</div>
      <div style={modelsContainerStyles}>
        {models.map(model => (
          <VideoAvatar
            key={model.provider}
            provider={model.provider}
            fallback={model.name}
            size={24}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Tabs Component
// Source: For model modal Presets/Custom tabs
// ============================================================================

type VideoTabsProps = {
  tabs: Array<{ id: string; label: string }>;
  activeTab: string;
};

export function VideoTabs({ tabs, activeTab }: VideoTabsProps) {
  const containerStyles: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
    gap: 4,
    padding: 4,
    backgroundColor: 'rgba(58, 58, 58, 0.5)',
    borderRadius: 10,
    marginBottom: 16,
  };

  return (
    <div style={containerStyles}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const tabStyles: CSSProperties = {
          padding: '8px 16px',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 500,
          color: isActive ? COLORS.foreground : COLORS.mutedForeground,
          backgroundColor: isActive ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
          textAlign: 'center',
          cursor: 'pointer',
          fontFamily: FONTS.sans,
        };
        return (
          <div key={tab.id} style={tabStyles}>
            {tab.label}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Drag Handle Icon
// ============================================================================

export function VideoDragHandle() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={COLORS.mutedForeground} strokeWidth={2} style={{ flexShrink: 0, cursor: 'grab' }}>
      <circle cx="9" cy="5" r="1" fill="currentColor" />
      <circle cx="9" cy="12" r="1" fill="currentColor" />
      <circle cx="9" cy="19" r="1" fill="currentColor" />
      <circle cx="15" cy="5" r="1" fill="currentColor" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
      <circle cx="15" cy="19" r="1" fill="currentColor" />
    </svg>
  );
}

// ============================================================================
// Provider Icon Mapping
// Source: @/lib/utils/ai-display.ts - getProviderIcon()
// Icons located at: /static/icons/ai-models/{provider}.png
// ============================================================================

const PROVIDER_ICONS: Record<string, string> = {
  'anthropic': 'claude.png',
  'openai': 'openai.png',
  'google': 'google.png',
  'meta': 'meta.png',
  'x-ai': 'grok.png',
  'deepseek': 'deepseek.png',
  'mistralai': 'mistral.png',
  'microsoft': 'microsoft.png',
};

export function getProviderIconPath(provider: string): string {
  const normalized = provider.toLowerCase().trim();
  const iconFile = PROVIDER_ICONS[normalized] || 'openrouter.png';
  return `static/icons/ai-models/${iconFile}`;
}

// ============================================================================
// Avatar Replica
// Source: @/components/ui/avatar.tsx + @/components/chat/participant-header.tsx
// CSS: "size-8 drop-shadow-[0_0_12px_hsl(var(--muted-foreground)/0.3)]"
// ============================================================================

type VideoAvatarProps = {
  src?: string;
  fallback: string;
  fallbackColor?: string;
  size?: number;
  /** Use provider name to auto-load icon from /static/icons/ai-models/ */
  provider?: string;
};

export function VideoAvatar({ src, fallback, fallbackColor, size = 32, provider }: VideoAvatarProps) {
  // If provider specified, get the actual icon path
  const imageSrc = provider ? staticFile(getProviderIconPath(provider)) : src;

  // Root: "relative flex size-8 shrink-0 overflow-hidden rounded-full"
  // Plus: "drop-shadow-[0_0_12px_hsl(var(--muted-foreground)/0.3)]"
  const rootStyles: CSSProperties = {
    position: 'relative',
    display: 'flex',
    width: size,
    height: size,
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: 9999,
    filter: 'drop-shadow(0 0 12px rgba(163, 163, 163, 0.3))',
  };

  // Fallback: "bg-muted flex size-full items-center justify-center rounded-full backdrop-blur-sm"
  const fallbackStyles: CSSProperties = {
    display: 'flex',
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: fallbackColor || COLORS.muted,
    backdropFilter: 'blur(4px)',
    fontSize: size * 0.4,
    fontWeight: 500,
    color: COLORS.mutedForeground,
  };

  // Image: "object-contain p-0.5"
  const imageStyles: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    padding: 2,
  };

  return (
    <div style={rootStyles}>
      {imageSrc
        ? (
            <Img src={imageSrc} style={imageStyles} />
          )
        : (
            <div style={fallbackStyles}>
              {fallback.slice(0, 2).toUpperCase()}
            </div>
          )}
    </div>
  );
}

// ============================================================================
// User Message Bubble
// Source: @/components/chat/chat-message-list.tsx lines 923-1003
// CSS: "max-w-[85%] ml-auto bg-secondary text-secondary-foreground
//       rounded-2xl rounded-br-md px-4 py-3 text-base leading-relaxed"
// ============================================================================

type VideoUserMessageProps = {
  children: ReactNode;
};

export function VideoUserMessage({ children }: VideoUserMessageProps) {
  // Container: "flex flex-col items-end gap-2" (right-aligned)
  const containerStyles: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 8,
    width: '100%',
  };

  // Bubble: "max-w-[85%] ml-auto w-fit min-w-0 overflow-hidden
  //          bg-secondary text-secondary-foreground
  //          rounded-2xl rounded-br-md px-4 py-3
  //          text-base leading-relaxed"
  const bubbleStyles: CSSProperties = {
    maxWidth: '85%',
    marginLeft: 'auto',
    width: 'fit-content',
    minWidth: 0,
    overflow: 'hidden',
    backgroundColor: COLORS.secondary,
    color: COLORS.secondaryForeground,
    borderRadius: 16, // rounded-2xl
    borderBottomRightRadius: 6, // rounded-br-md
    padding: '12px 16px',
    fontSize: 16,
    lineHeight: 1.625,
  };

  return (
    <div style={containerStyles}>
      <div style={bubbleStyles}>
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// Participant Header
// Source: @/components/chat/participant-header.tsx
// CSS: "flex items-center gap-3 mb-6"
// ============================================================================

type VideoParticipantHeaderProps = {
  modelName: string;
  /** Provider name for auto-loading icon (e.g., 'anthropic', 'openai', 'google') */
  provider?: string;
  /** Custom avatar src (if not using provider) */
  avatarSrc?: string;
  avatarFallback?: string;
  avatarColor?: string;
  role?: string;
  roleColor?: string;
  showStreamingIndicator?: boolean;
  /** Use Roundtable logo for moderator */
  isModerator?: boolean;
};

export function VideoParticipantHeader({
  modelName,
  provider,
  avatarSrc,
  avatarFallback,
  avatarColor,
  role,
  roleColor,
  showStreamingIndicator = false,
  isModerator = false,
}: VideoParticipantHeaderProps) {
  // Header: "flex items-center gap-3 mb-6"
  const headerStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  };

  // Model name: "text-xl font-semibold text-muted-foreground"
  const nameStyles: CSSProperties = {
    fontSize: 20,
    fontWeight: 600,
    color: COLORS.mutedForeground,
  };

  // Role badge: "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
  const roleBadgeStyles: CSSProperties = role
    ? {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 500,
        border: `1px solid ${roleColor || COLORS.borderWhite20}`,
        color: roleColor || COLORS.mutedForeground,
        backgroundColor: roleColor ? `${roleColor}15` : 'transparent',
      }
    : {};

  // Streaming indicator: "ml-1 size-1.5 rounded-full bg-primary/60 animate-pulse"
  const indicatorStyles: CSSProperties = {
    marginLeft: 4,
    width: 6,
    height: 6,
    borderRadius: 9999,
    backgroundColor: COLORS.primary60,
  };

  // Determine avatar source
  const finalAvatarSrc = isModerator
    ? staticFile('static/logo.webp')
    : provider
      ? undefined // Will use provider prop in VideoAvatar
      : avatarSrc;

  return (
    <div style={headerStyles}>
      <VideoAvatar
        src={finalAvatarSrc}
        provider={isModerator ? undefined : provider}
        fallback={avatarFallback || modelName}
        fallbackColor={avatarColor}
        size={32}
      />
      <span style={nameStyles}>{modelName}</span>
      {role && <span style={roleBadgeStyles}>{role}</span>}
      {showStreamingIndicator && <span style={indicatorStyles} />}
    </div>
  );
}

// ============================================================================
// Participant Message Card
// Source: @/components/chat/model-message-card.tsx
// Combines header + message content in the actual app layout
// ============================================================================

type VideoParticipantMessageProps = {
  modelName: string;
  provider?: string;
  avatarSrc?: string;
  avatarFallback?: string;
  avatarColor?: string;
  role?: string;
  roleColor?: string;
  showStreamingIndicator?: boolean;
  isModerator?: boolean;
  children: ReactNode;
};

export function VideoParticipantMessage({
  modelName,
  provider,
  avatarSrc,
  avatarFallback,
  avatarColor,
  role,
  roleColor,
  showStreamingIndicator = false,
  isModerator = false,
  children,
}: VideoParticipantMessageProps) {
  // Wrapper matches model-message-card structure
  const wrapperStyles: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    width: '100%',
  };

  // Content: "text-base leading-relaxed text-foreground"
  const contentStyles: CSSProperties = {
    color: COLORS.foreground,
    fontSize: 16,
    lineHeight: 1.6,
  };

  return (
    <div style={wrapperStyles}>
      <VideoParticipantHeader
        modelName={modelName}
        provider={provider}
        avatarSrc={avatarSrc}
        avatarFallback={avatarFallback}
        avatarColor={avatarColor}
        role={role}
        roleColor={roleColor}
        showStreamingIndicator={showStreamingIndicator}
        isModerator={isModerator}
      />
      <div style={contentStyles}>
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// Chat Input Replica (for showing the input UI, not user message)
// Source: @/components/chat/chat-input.tsx
// Container: "relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-lg"
// ============================================================================

type VideoChatInputProps = {
  value: string;
  placeholder?: string;
};

export function VideoChatInput({ value, placeholder }: VideoChatInputProps) {
  const containerStyles: CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: 16,
    border: `1px solid ${COLORS.borderWhite12}`,
    backgroundColor: COLORS.card,
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  };

  const textareaContainerStyles: CSSProperties = {
    padding: '16px',
  };

  const textStyles: CSSProperties = {
    width: '100%',
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: 16,
    lineHeight: 1.625,
    color: value ? COLORS.foreground : `${COLORS.mutedForeground}99`,
    paddingLeft: 16,
    paddingRight: 16,
  };

  const toolbarStyles: CSSProperties = {
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  };

  // Button white variant: "bg-white text-black min-h-11 min-w-11 rounded-full"
  const buttonStyles: CSSProperties = {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 9999,
    backgroundColor: COLORS.white,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  };

  return (
    <div style={containerStyles}>
      <div style={textareaContainerStyles}>
        <div style={textStyles}>
          {value || placeholder}
        </div>
      </div>
      <div style={toolbarStyles}>
        <div style={buttonStyles}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={COLORS.black} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Logo Replica
// Source: @/components/logo/index.tsx
// Uses staticFile to load actual logo.webp from public/static/
// ============================================================================

type VideoLogoProps = {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
};

const LOGO_SIZES = {
  sm: { icon: 32, text: 24 },
  md: { icon: 48, text: 32 },
  lg: { icon: 64, text: 42 },
  xl: { icon: 80, text: 56 },
};

export function VideoLogo({ size = 'md', showText = true }: VideoLogoProps) {
  const { icon, text } = LOGO_SIZES[size];
  const logoSrc = staticFile('static/logo.webp');

  const containerStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: icon * 0.3,
  };

  const textStyles: CSSProperties = {
    fontSize: text,
    fontWeight: 700,
    color: COLORS.white,
    letterSpacing: '-0.02em',
    fontFamily: FONTS.sans,
  };

  return (
    <div style={containerStyles}>
      <Img
        src={logoSrc}
        width={icon}
        height={icon}
        style={{ objectFit: 'contain' }}
      />
      {showText && (
        <span style={textStyles}>Roundtable</span>
      )}
    </div>
  );
}

// ============================================================================
// GlassCard Replica
// Source: @/lib/ui/glassmorphism.ts
// glassVariants.medium: "backdrop-blur-xl bg-background/15 border-white/20 shadow-lg"
// ============================================================================

type VideoGlassCardProps = {
  children: ReactNode;
  variant?: 'subtle' | 'medium' | 'strong';
  style?: CSSProperties;
};

const GLASS_STYLES = {
  subtle: {
    backdropFilter: 'blur(16px)',
    backgroundColor: 'rgba(26, 26, 26, 0.1)',
    border: `1px solid ${COLORS.borderWhite20}`,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },
  medium: {
    backdropFilter: 'blur(24px)',
    backgroundColor: 'rgba(26, 26, 26, 0.15)',
    border: `1px solid ${COLORS.borderWhite20}`,
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  },
  strong: {
    backdropFilter: 'blur(40px)',
    backgroundColor: 'rgba(26, 26, 26, 0.25)',
    border: `1px solid ${COLORS.borderWhite30}`,
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  },
};

export function VideoGlassCard({ children, variant = 'medium', style }: VideoGlassCardProps) {
  const glassStyles = GLASS_STYLES[variant];

  return (
    <div
      style={{
        ...glassStyles,
        borderRadius: 16,
        padding: '16px 24px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Button Replica
// Source: @/components/ui/button.tsx
// white: "bg-white text-black shadow-xs hover:bg-white/90"
// ============================================================================

type VideoButtonProps = {
  children: ReactNode;
  variant?: 'default' | 'white' | 'ghost' | 'glass';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  style?: CSSProperties;
};

const BUTTON_VARIANTS = {
  default: {
    backgroundColor: COLORS.foreground,
    color: COLORS.background,
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  },
  white: {
    backgroundColor: COLORS.white,
    color: COLORS.black,
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: COLORS.foreground,
  },
  glass: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: COLORS.foreground,
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  },
};

const BUTTON_SIZES = {
  sm: { height: 32, padding: '0 12px', fontSize: 14 },
  md: { height: 40, padding: '0 16px', fontSize: 14 },
  lg: { height: 44, padding: '0 24px', fontSize: 14 },
  icon: { width: 40, height: 40, padding: 0 },
};

export function VideoButton({ children, variant = 'default', size = 'md', style }: VideoButtonProps) {
  const variantStyles = BUTTON_VARIANTS[variant];
  const sizeStyles = BUTTON_SIZES[size];

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        whiteSpace: 'nowrap',
        borderRadius: 12,
        fontWeight: 500,
        ...variantStyles,
        ...sizeStyles,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Auto/Manual Mode Toggle
// Source: @/components/chat/chat-auto-mode-toggle.tsx
// Active: Purple gradient pill with sparkles icon
// ============================================================================

type VideoAutoModeToggleProps = {
  mode: 'auto' | 'manual';
};

export function VideoAutoModeToggle({ mode }: VideoAutoModeToggleProps) {
  const containerStyles: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: 4,
    gap: 4,
  };

  const baseButtonStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    position: 'relative',
  };

  const autoActiveStyles: CSSProperties = {
    ...baseButtonStyles,
    background: 'linear-gradient(to right, rgba(139, 92, 246, 0.2), rgba(168, 85, 247, 0.2), rgba(217, 70, 239, 0.2))',
    border: '1px solid rgba(168, 85, 247, 0.3)',
    color: 'rgb(168, 85, 247)',
  };

  const autoInactiveStyles: CSSProperties = {
    ...baseButtonStyles,
    background: 'transparent',
    border: '1px solid transparent',
    color: COLORS.mutedForeground,
  };

  const manualActiveStyles: CSSProperties = {
    ...baseButtonStyles,
    background: 'rgba(58, 58, 58, 0.5)',
    border: '1px solid rgba(77, 77, 77, 0.5)',
    color: COLORS.foreground,
  };

  const manualInactiveStyles: CSSProperties = {
    ...baseButtonStyles,
    background: 'transparent',
    border: '1px solid transparent',
    color: COLORS.mutedForeground,
  };

  // Sparkles icon SVG
  const SparklesIcon = ({ color }: { color: string }) => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );

  return (
    <div style={containerStyles}>
      <div style={mode === 'auto' ? autoActiveStyles : autoInactiveStyles}>
        <SparklesIcon color={mode === 'auto' ? 'rgb(168, 85, 247)' : COLORS.mutedForeground} />
        <span>Auto</span>
      </div>
      <div style={mode === 'manual' ? manualActiveStyles : manualInactiveStyles}>
        <span>Manual</span>
      </div>
    </div>
  );
}

// ============================================================================
// Model Selection Button with Avatar Group
// Source: @/components/chat/chat-input-toolbar-menu.tsx
// Shows selected model avatars in a grouped display
// ============================================================================

type VideoModelSelectionButtonProps = {
  models: Array<{ provider: string; name: string }>;
};

export function VideoModelSelectionButton({ models }: VideoModelSelectionButtonProps) {
  const buttonStyles: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 36,
    padding: '0 12px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 500,
    border: `1px solid ${COLORS.borderWhite12}`,
    backgroundColor: 'transparent',
    color: COLORS.foreground,
    cursor: 'pointer',
  };

  // Avatar group - overlapping circles
  const avatarGroupStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
  };

  return (
    <div style={buttonStyles}>
      <div style={avatarGroupStyles}>
        {models.slice(0, 4).map((model, index) => (
          <div
            key={model.provider}
            style={{
              marginLeft: index === 0 ? 0 : -8,
              zIndex: models.length - index,
            }}
          >
            <VideoAvatar
              provider={model.provider}
              fallback={model.name}
              size={24}
            />
          </div>
        ))}
        {models.length > 4 && (
          <div
            style={{
              marginLeft: -8,
              width: 24,
              height: 24,
              borderRadius: 9999,
              backgroundColor: COLORS.muted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 600,
              color: COLORS.mutedForeground,
              border: `2px solid ${COLORS.background}`,
            }}
          >
            +
            {models.length - 4}
          </div>
        )}
      </div>
      <span>Models</span>
      {/* Chevron down */}
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

// ============================================================================
// File Attachment Chip
// Source: @/components/chat/chat-input-attachments.tsx
// Shows attached file with icon and name
// ============================================================================

type VideoFileChipProps = {
  filename: string;
  fileType: 'image' | 'pdf' | 'code' | 'text';
  previewUrl?: string;
};

const FILE_TYPE_COLORS = {
  image: 'rgba(56, 189, 248, 0.2)', // cyan
  pdf: 'rgba(239, 68, 68, 0.2)', // red
  code: 'rgba(139, 92, 246, 0.2)', // purple
  text: 'rgba(163, 163, 163, 0.2)', // gray
};

export function VideoFileChip({ filename, fileType, previewUrl }: VideoFileChipProps) {
  const chipStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingLeft: 6,
    paddingRight: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(58, 58, 58, 0.6)',
    border: `1px solid ${COLORS.borderWhite12}`,
    position: 'relative',
  };

  const iconContainerStyles: CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: previewUrl ? 'transparent' : FILE_TYPE_COLORS[fileType],
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  const textStyles: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  };

  const filenameStyles: CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
    color: 'rgba(222, 222, 222, 0.9)',
    maxWidth: 140,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const extensionStyles: CSSProperties = {
    fontSize: 12,
    color: COLORS.mutedForeground,
    textTransform: 'uppercase',
  };

  const removeButtonStyles: CSSProperties = {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 9999,
    backgroundColor: 'rgba(26, 26, 26, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: COLORS.mutedForeground,
  };

  // File icons
  const FileIcon = () => {
    const iconColor = COLORS.foreground;
    if (fileType === 'image') {
      return (
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth={2}>
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      );
    }
    if (fileType === 'pdf') {
      return (
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth={2}>
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        </svg>
      );
    }
    if (fileType === 'code') {
      return (
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth={2}>
          <path d="m18 16 4-4-4-4" />
          <path d="m6 8-4 4 4 4" />
          <path d="m14.5 4-5 16" />
        </svg>
      );
    }
    return (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth={2}>
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        <path d="M10 9H8" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
      </svg>
    );
  };

  const extension = filename.split('.').pop() || '';

  return (
    <div style={chipStyles}>
      <div style={iconContainerStyles}>
        {previewUrl
          ? (
              <Img src={previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )
          : (
              <FileIcon />
            )}
      </div>
      <div style={textStyles}>
        <span style={filenameStyles}>{filename}</span>
        <span style={extensionStyles}>{extension}</span>
      </div>
      <div style={removeButtonStyles}>
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </div>
    </div>
  );
}

// ============================================================================
// Model Item (for modal display)
// Source: @/components/chat/model-item.tsx
// Shows model with avatar, name, description, and toggle
// ============================================================================

type VideoModelItemProps = {
  provider: string;
  modelName: string;
  description?: string;
  isSelected?: boolean;
  showDragHandle?: boolean;
  role?: string;
  roleColor?: string;
};

export function VideoModelItem({
  provider,
  modelName,
  description,
  isSelected = false,
  showDragHandle = false,
  role,
  roleColor,
}: VideoModelItemProps) {
  const itemStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    padding: '12px 16px',
    borderRadius: 12,
    backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
  };

  const infoStyles: CSSProperties = {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  };

  const nameStyles: CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: COLORS.foreground,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const descStyles: CSSProperties = {
    fontSize: 12,
    color: COLORS.mutedForeground,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const roleBadgeStyles: CSSProperties = role
    ? {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 9999,
        fontSize: 10,
        fontWeight: 600,
        border: `1px solid ${roleColor || COLORS.borderWhite20}`,
        color: roleColor || COLORS.mutedForeground,
        backgroundColor: roleColor ? `${roleColor}15` : 'transparent',
        marginLeft: 8,
      }
    : {};

  // Toggle switch
  const toggleStyles: CSSProperties = {
    width: 36,
    height: 20,
    borderRadius: 9999,
    backgroundColor: isSelected ? 'rgb(168, 85, 247)' : COLORS.muted,
    position: 'relative',
    flexShrink: 0,
  };

  const toggleKnobStyles: CSSProperties = {
    position: 'absolute',
    top: 2,
    left: isSelected ? 18 : 2,
    width: 16,
    height: 16,
    borderRadius: 9999,
    backgroundColor: COLORS.white,
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  };

  return (
    <div style={itemStyles}>
      {showDragHandle && (
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={COLORS.mutedForeground} strokeWidth={2} style={{ flexShrink: 0, cursor: 'grab' }}>
          <circle cx="9" cy="5" r="1" />
          <circle cx="9" cy="12" r="1" />
          <circle cx="9" cy="19" r="1" />
          <circle cx="15" cy="5" r="1" />
          <circle cx="15" cy="12" r="1" />
          <circle cx="15" cy="19" r="1" />
        </svg>
      )}
      <VideoAvatar provider={provider} fallback={modelName} size={40} />
      <div style={infoStyles}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={nameStyles}>{modelName}</span>
          {role && <span style={roleBadgeStyles}>{role}</span>}
        </div>
        {description && <span style={descStyles}>{description}</span>}
      </div>
      <div style={toggleStyles}>
        <div style={toggleKnobStyles} />
      </div>
    </div>
  );
}

// ============================================================================
// Full Chat Input with Toolbar
// Source: @/components/chat/chat-input.tsx
// Shows complete input with toolbar items
// ============================================================================

type VideoFullChatInputProps = {
  value?: string;
  placeholder?: string;
  mode?: 'auto' | 'manual';
  models?: Array<{ provider: string; name: string }>;
  attachments?: Array<{ filename: string; fileType: 'image' | 'pdf' | 'code' | 'text' }>;
};

export function VideoFullChatInput({
  value = '',
  placeholder = 'Ask anything...',
  mode = 'manual',
  models = [],
  attachments = [],
}: VideoFullChatInputProps) {
  const containerStyles: CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: 16,
    border: `1px solid ${COLORS.borderWhite12}`,
    backgroundColor: COLORS.card,
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  };

  // Attachments row
  const attachmentsRowStyles: CSSProperties = {
    display: attachments.length > 0 ? 'flex' : 'none',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    borderBottom: `1px solid ${COLORS.borderWhite12}`,
    overflowX: 'auto',
  };

  // Textarea
  const textareaStyles: CSSProperties = {
    width: '100%',
    padding: '16px',
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: 16,
    lineHeight: 1.625,
    color: value ? COLORS.foreground : `${COLORS.mutedForeground}99`,
  };

  // Toolbar
  const toolbarStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px 12px',
  };

  const toolbarLeftStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const toolbarRightStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  };

  // Attachment button
  const attachBtnStyles: CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 12,
    border: `1px solid ${COLORS.borderWhite12}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: COLORS.mutedForeground,
  };

  // Send button
  const sendBtnStyles: CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 9999,
    backgroundColor: COLORS.white,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div style={containerStyles}>
      {/* Attachments */}
      <div style={attachmentsRowStyles}>
        {attachments.map((att, i) => (
          <VideoFileChip key={i} filename={att.filename} fileType={att.fileType} />
        ))}
      </div>

      {/* Textarea */}
      <div style={textareaStyles}>
        {value || placeholder}
      </div>

      {/* Toolbar */}
      <div style={toolbarStyles}>
        <div style={toolbarLeftStyles}>
          <VideoAutoModeToggle mode={mode} />
          {models.length > 0 && <VideoModelSelectionButton models={models} />}
          <div style={attachBtnStyles}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </div>
        </div>
        <div style={toolbarRightStyles}>
          <div style={sendBtnStyles}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={COLORS.black} strokeWidth={2.5}>
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Pre-Search Card (Web Search)
// Source: @/components/chat/pre-search-card.tsx
// Shows web search with blue globe icon and collapsible results
// ============================================================================

type VideoPreSearchCardProps = {
  isOpen?: boolean;
  isStreaming?: boolean;
  query?: string;
  results?: Array<{
    domain: string;
    title: string;
    snippet?: string;
  }>;
  totalSources?: number;
};

export function VideoPreSearchCard({
  isOpen = true,
  isStreaming = false,
  query = 'SaaS product launch strategies',
  results = [],
  totalSources = 0,
}: VideoPreSearchCardProps) {
  // Header: flex items-center gap-3 mb-6
  const headerStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  };

  // Icon container: size-8 flex items-center justify-center rounded-full bg-blue-500/20
  const iconContainerStyles: CSSProperties = {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: 'rgba(59, 130, 246, 0.2)', // bg-blue-500/20
    flexShrink: 0,
  };

  // Title: text-xl font-semibold text-muted-foreground
  const titleStyles: CSSProperties = {
    fontSize: 20,
    fontWeight: 600,
    color: COLORS.mutedForeground,
    fontFamily: FONTS.sans,
  };

  // Streaming indicator
  const indicatorStyles: CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: 9999,
    backgroundColor: 'rgba(234, 234, 234, 0.6)', // bg-primary/60
    flexShrink: 0,
  };

  // Collapsible trigger
  const triggerStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    color: COLORS.mutedForeground,
    fontSize: 14,
    cursor: 'pointer',
  };

  // Chevron rotation
  const chevronStyles: CSSProperties = {
    width: 14,
    height: 14,
    flexShrink: 0,
    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
    transition: 'transform 0.2s ease',
  };

  // Content container
  const contentStyles: CSSProperties = {
    marginTop: isOpen ? 12 : 0,
    display: isOpen ? 'block' : 'none',
  };

  // Query display
  const queryStyles: CSSProperties = {
    fontSize: 14,
    color: COLORS.foreground,
    fontWeight: 500,
    marginBottom: 12,
    padding: '8px 12px',
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.1)', // subtle blue bg
    border: '1px solid rgba(59, 130, 246, 0.2)',
    fontFamily: FONTS.sans,
  };

  return (
    <div style={{ width: '100%', marginBottom: 20 }}>
      <div style={headerStyles}>
        <div style={iconContainerStyles}>
          {/* Globe icon - text-blue-300 */}
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
            <path d="M2 12h20" />
          </svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={titleStyles}>Web Search</span>
          {isStreaming && <span style={indicatorStyles} />}
        </div>
      </div>

      <div style={triggerStyles}>
        <svg style={chevronStyles} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="m9 18 6-6-6-6" />
        </svg>
        <span style={{ fontWeight: 500 }}>
          {isStreaming ? 'Searching...' : `Searched ${totalSources} sources`}
        </span>
      </div>

      <div style={contentStyles}>
        {query && (
          <div style={queryStyles}>
            🔍
            {query}
          </div>
        )}
        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map((result, i) => (
              <VideoWebSearchResult
                key={i}
                domain={result.domain}
                title={result.title}
                url={`https://${result.domain}`}
                snippet={result.snippet}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
