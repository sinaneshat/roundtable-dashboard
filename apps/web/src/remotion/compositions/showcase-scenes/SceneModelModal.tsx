/**
 * Scene: Model Selection Modal with Tabs
 * Duration: 300 frames (10 seconds at 30fps)
 *
 * Timeline:
 * - Frame 0-30: Modal fades in with presets visible
 * - Frame 30-90: Show Presets tab with preset cards animating in
 * - Frame 90-120: Tab switches to Custom with animation
 * - Frame 120-200: Custom models appear with stagger, show capability tags
 * - Frame 200-240: Drag reorder animation
 * - Frame 240-270: Role chip assigned to model
 * - Frame 270-300: Modal closes
 */

import type { CSSProperties } from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

import { BrowserFrame } from '../../components/BrowserFrame';
import { DepthParticles, EdgeVignette } from '../../components/scene-primitives';
import {
  VideoAvatar,
  VideoDragHandle,
  VideoFeatureCaptions,
  VideoTabs,
} from '../../components/ui-replicas';
import { useCinematicCamera } from '../../hooks';
import { BACKGROUNDS, SPACING, TEXT } from '../../lib/design-tokens';

// Role colors matching actual app
type RoleName = 'Researcher' | 'Writer' | 'Analyst' | 'Critic' | 'Creator';
const ROLE_COLORS: Record<RoleName, { bg: string; text: string; border: string }> = {
  Researcher: { bg: 'rgba(59, 130, 246, 0.2)', text: '#93c5fd', border: 'rgba(59, 130, 246, 0.3)' },
  Writer: { bg: 'rgba(168, 85, 247, 0.2)', text: '#c4b5fd', border: 'rgba(168, 85, 247, 0.3)' },
  Analyst: { bg: 'rgba(34, 197, 94, 0.2)', text: '#86efac', border: 'rgba(34, 197, 94, 0.3)' },
  Critic: { bg: 'rgba(239, 68, 68, 0.2)', text: '#fca5a5', border: 'rgba(239, 68, 68, 0.3)' },
  Creator: { bg: 'rgba(251, 146, 60, 0.2)', text: '#fdba74', border: 'rgba(251, 146, 60, 0.3)' },
};

// Demo presets with model roles
const PRESETS: Array<{
  id: string;
  name: string;
  description: string;
  modelRoles: Array<{ provider: string; name: string; role: RoleName }>;
}> = [
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Best for general questions and diverse perspectives',
    modelRoles: [
      { provider: 'anthropic', name: 'Claude', role: 'Analyst' },
      { provider: 'openai', name: 'GPT-4o', role: 'Writer' },
      { provider: 'google', name: 'Gemini', role: 'Researcher' },
    ],
  },
  {
    id: 'research',
    name: 'Research',
    description: 'Deep analysis with citations and fact-checking',
    modelRoles: [
      { provider: 'anthropic', name: 'Claude', role: 'Researcher' },
      { provider: 'deepseek', name: 'DeepSeek', role: 'Analyst' },
    ],
  },
  {
    id: 'creative',
    name: 'Creative',
    description: 'Brainstorming, ideation, and creative writing',
    modelRoles: [
      { provider: 'openai', name: 'GPT-4o', role: 'Creator' },
      { provider: 'google', name: 'Gemini', role: 'Writer' },
      { provider: 'anthropic', name: 'Claude', role: 'Critic' },
    ],
  },
  {
    id: 'technical',
    name: 'Technical',
    description: 'Code review, architecture, and debugging',
    modelRoles: [
      { provider: 'anthropic', name: 'Claude', role: 'Analyst' },
      { provider: 'deepseek', name: 'DeepSeek', role: 'Researcher' },
      { provider: 'openai', name: 'GPT-4o', role: 'Critic' },
    ],
  },
];

// Demo models for custom tab
const CUSTOM_MODELS = [
  {
    provider: 'anthropic',
    name: 'Claude 3.5 Sonnet',
    description: 'Anthropic\'s most intelligent model',
    selected: true,
    capabilities: ['reasoning', 'vision', 'pdf'] as const,
  },
  {
    provider: 'openai',
    name: 'GPT-4o',
    description: 'OpenAI\'s flagship multimodal model',
    selected: true,
    capabilities: ['reasoning', 'vision', 'fast'] as const,
  },
  {
    provider: 'google',
    name: 'Gemini 2.0 Flash',
    description: 'Google\'s fastest reasoning model',
    selected: false,
    capabilities: ['reasoning', 'vision', 'fast'] as const,
  },
  {
    provider: 'deepseek',
    name: 'DeepSeek R1',
    description: 'Advanced reasoning and code generation',
    selected: false,
    capabilities: ['reasoning', 'pdf'] as const,
  },
];

// Capability tags
const CAPABILITY_TAGS = [
  { id: 'reasoning', label: 'Reasoning', icon: 'brain' },
  { id: 'vision', label: 'Vision', icon: 'eye' },
  { id: 'pdf', label: 'PDF', icon: 'file' },
  { id: 'fast', label: 'Fast', icon: 'zap' },
] as const;

// Capability Icon Component
function CapabilityIcon({ type, color }: { type: string; color: string }) {
  if (type === 'brain') {
    return (
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
        <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
        <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      </svg>
    );
  }
  if (type === 'eye') {
    return (
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  if (type === 'file') {
    return (
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      </svg>
    );
  }
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </svg>
  );
}

// Role badge component
function RoleBadge({ role, showClear }: { role: RoleName; showClear?: boolean }) {
  const colors = ROLE_COLORS[role];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        paddingRight: showClear ? 4 : 8,
        borderRadius: 9999,
        fontSize: 10,
        fontWeight: 600,
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        fontFamily: '\'Noto Sans\', system-ui, sans-serif',
      }}
    >
      {role}
      {showClear && (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 14,
            height: 14,
            borderRadius: 9999,
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
          }}
        >
          <svg width={8} height={8} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </span>
      )}
    </span>
  );
}

// Preset Card component
function VideoPresetCard({
  preset,
  isSelected,
  opacity,
  translateY,
}: {
  preset: typeof PRESETS[0];
  isSelected: boolean;
  opacity: number;
  translateY: number;
}) {
  const cardStyles: CSSProperties = {
    padding: 16,
    borderRadius: 16,
    border: isSelected ? '2px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(255, 255, 255, 0.08)',
    backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.1)' : 'rgba(40, 40, 40, 0.6)',
    cursor: 'pointer',
    opacity,
    transform: `translateY(${translateY}px)`,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    overflow: 'hidden',
  };

  return (
    <div style={cardStyles}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: TEXT.primary,
            margin: 0,
            fontFamily: '\'Noto Sans\', system-ui, sans-serif',
          }}
        >
          {preset.name}
        </h3>
      </div>

      {/* Model avatars with roles */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, overflow: 'hidden', flexWrap: 'nowrap' }}>
        {preset.modelRoles.map((model) => {
          const roleColors = ROLE_COLORS[model.role];
          return (
            <div key={model.provider} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <VideoAvatar provider={model.provider} fallback={model.name} size={36} />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: roleColors.text,
                  maxWidth: 80,
                  textAlign: 'center',
                  fontFamily: '\'Noto Sans\', system-ui, sans-serif',
                }}
              >
                {model.role}
              </span>
            </div>
          );
        })}
      </div>

      <p
        style={{
          fontSize: 12,
          color: TEXT.muted,
          margin: 0,
          lineHeight: 1.5,
          fontFamily: '\'Noto Sans\', system-ui, sans-serif',
        }}
      >
        {preset.description}
      </p>
    </div>
  );
}

export function SceneModelModal() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Exit fade in last 10 frames
  const exitFade = frame > 290
    ? interpolate(frame, [290, 300], [1, 0], { extrapolateRight: 'clamp' })
    : 1;

  // Camera breathing
  const { breathingOffset } = useCinematicCamera({
    movement: 'static',
    breathingEnabled: true,
    breathingIntensity: 2,
  });

  // Phase timing
  const PHASE = {
    modalEntrance: { start: 0, end: 30 },
    presetsTab: { start: 30, end: 90 },
    tabSwitch: { start: 90, end: 120 },
    modelsAppear: { start: 120, end: 200 },
    dragReorder: { start: 200, end: 240 },
    roleAssign: { start: 240, end: 270 },
    modalClose: { start: 270, end: 300 },
  };

  // Modal entrance
  const modalProgress = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 150, mass: 0.8 },
    durationInFrames: 25,
  });

  const modalScale = interpolate(modalProgress, [0, 1], [0.9, 1]);
  const modalOpacity = interpolate(modalProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Tab state - Presets first, then Custom
  const activeTab = frame < PHASE.tabSwitch.start ? 'presets' : 'custom';

  // Tab switch animation
  const tabSwitchProgress = frame >= PHASE.tabSwitch.start
    ? spring({
        frame: frame - PHASE.tabSwitch.start,
        fps,
        config: { damping: 25, stiffness: 200 },
        durationInFrames: 20,
      })
    : 0;

  // Selected preset (frame 50-90)
  const selectedPresetIndex = frame >= 50 && frame < PHASE.tabSwitch.start ? 0 : -1;

  // Model reorder animation
  const reorderProgress = frame >= PHASE.dragReorder.start
    ? spring({
        frame: frame - PHASE.dragReorder.start,
        fps,
        config: { damping: 25, stiffness: 200 },
        durationInFrames: 25,
      })
    : 0;

  const getModelOffset = (index: number): number => {
    if (reorderProgress === 0)
      return 0;
    if (index === 0)
      return interpolate(reorderProgress, [0, 1], [0, 72]);
    if (index === 1)
      return interpolate(reorderProgress, [0, 1], [0, -72]);
    return 0;
  };

  // Role assignment
  const showRoleBadge = frame >= PHASE.roleAssign.start;
  const roleAssignProgress = showRoleBadge
    ? spring({
        frame: frame - PHASE.roleAssign.start,
        fps,
        config: { damping: 20, stiffness: 180 },
        durationInFrames: 15,
      })
    : 0;

  // Modal close
  const closeProgress = frame >= PHASE.modalClose.start
    ? spring({
        frame: frame - PHASE.modalClose.start,
        fps,
        config: { damping: 30, stiffness: 200 },
        durationInFrames: 20,
      })
    : 0;

  const finalModalScale = interpolate(closeProgress, [0, 1], [1, 0.9]);
  const finalModalOpacity = interpolate(closeProgress, [0, 1], [1, 0]);

  // Unified entrance zoom - same timing across all scenes
  const entranceZoom = interpolate(
    spring({ frame, fps, config: { damping: 25, stiffness: 150 }, durationInFrames: 25 }),
    [0, 1],
    [0.96, 1],
  );

  // Selected capability tag in custom view
  const selectedTagIndex = frame >= PHASE.modelsAppear.start + 15 ? 0 : -1;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BACKGROUNDS.primary,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: SPACING.lg,
        perspective: 1200,
        fontFamily: '\'Noto Sans\', system-ui, sans-serif',
      }}
    >
      {/* Background particles */}
      <div
        style={{
          transform: `translate(${breathingOffset.x * 0.2}px, ${breathingOffset.y * 0.2}px)`,
        }}
      >
        <DepthParticles frame={frame} baseOpacity={0.3} count={15} />
      </div>

      <EdgeVignette innerRadius={50} edgeOpacity={0.5} />

      {/* Feature Label */}
      <VideoFeatureCaptions
        position="bottom-left"
        captions={[
          { start: 0, end: 60, text: 'Model selection', subtitle: 'Browse presets or build custom configurations' },
          { start: 60, end: 150, text: 'Preset configurations', subtitle: 'One-click setups for common use cases' },
          { start: 150, end: 250, text: 'Custom models', subtitle: 'Drag to reorder, toggle to enable/disable' },
          { start: 250, end: 300, text: 'Apply & go', subtitle: 'Your selected models are ready to collaborate' },
        ]}
      />

      {/* Browser Frame with Modal - with orbit and zoom pulse */}
      <div
        style={{
          transform: `scale(${entranceZoom})`,
          transformOrigin: 'center center',
          opacity: exitFade,
        }}
      >
        <BrowserFrame url="roundtable.ai">
          <div
            style={{
              width: 1200,
              height: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: BACKGROUNDS.primary,
              overflow: 'hidden',
            }}
          >
            {/* Modal Container */}
            <div
              style={{
                transform: `scale(${modalScale * finalModalScale})`,
                opacity: modalOpacity * finalModalOpacity,
                zIndex: 10,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: 900,
                  height: 580,
                  borderRadius: 24,
                  backgroundColor: 'rgba(40, 40, 40, 0.95)',
                  backdropFilter: 'blur(40px)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: '0 40px 80px -20px rgba(0, 0, 0, 0.6)',
                  overflow: 'hidden',
                }}
              >
                {/* Modal Header */}
                <div
                  style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 20, fontWeight: 600, color: TEXT.primary }}>
                    Select Models
                  </span>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    }}
                  >
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={TEXT.muted} strokeWidth={2}>
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </div>
                </div>

                {/* Tabs */}
                <div style={{ padding: '16px 24px 0', flexShrink: 0 }}>
                  <VideoTabs
                    tabs={[
                      { id: 'presets', label: 'Presets' },
                      { id: 'custom', label: 'Custom' },
                    ]}
                    activeTab={activeTab}
                  />
                </div>

                {/* Tab Content - Flex grow */}
                <div style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}>
                  {/* Presets Tab Content */}
                  {activeTab === 'presets' && (
                    <div
                      style={{
                        padding: '16px 24px 24px',
                        opacity: interpolate(tabSwitchProgress, [0, 1], [1, 0], { extrapolateRight: 'clamp' }),
                        position: 'absolute',
                        inset: 0,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, 1fr)',
                          gap: 12,
                          overflow: 'hidden',
                        }}
                      >
                        {PRESETS.map((preset, i) => {
                          const presetDelay = 15 + i * 8;
                          const presetProgress = spring({
                            frame: frame - presetDelay,
                            fps,
                            config: { damping: 25, stiffness: 180 },
                            durationInFrames: 20,
                          });
                          const presetOpacity = interpolate(presetProgress, [0, 0.5], [0, 1], {
                            extrapolateRight: 'clamp',
                          });
                          const presetY = interpolate(presetProgress, [0, 1], [25, 0]);

                          return (
                            <VideoPresetCard
                              key={preset.id}
                              preset={preset}
                              isSelected={i === selectedPresetIndex}
                              opacity={presetOpacity}
                              translateY={presetY}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Custom Tab Content */}
                  {activeTab === 'custom' && (
                    <div
                      style={{
                        padding: '16px 24px 24px',
                        opacity: interpolate(tabSwitchProgress, [0, 1], [0, 1], { extrapolateLeft: 'clamp' }),
                        position: 'absolute',
                        inset: 0,
                        overflow: 'hidden',
                      }}
                    >
                      {/* Search input */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '10px 14px',
                          borderRadius: 12,
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          backgroundColor: 'rgba(255, 255, 255, 0.03)',
                          marginBottom: 14,
                        }}
                      >
                        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={TEXT.muted} strokeWidth={2}>
                          <circle cx="11" cy="11" r="8" />
                          <path d="m21 21-4.3-4.3" />
                        </svg>
                        <span style={{ fontSize: 14, color: TEXT.muted }}>Search models...</span>
                      </div>

                      {/* Capability filter tags */}
                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                          marginBottom: 18,
                          flexWrap: 'wrap',
                        }}
                      >
                        {CAPABILITY_TAGS.map((tag, i) => {
                          const isSelected = i === selectedTagIndex;
                          return (
                            <div
                              key={tag.id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '6px 12px',
                                borderRadius: 9999,
                                fontSize: 12,
                                fontWeight: 500,
                                backgroundColor: isSelected ? 'rgba(234, 234, 234, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                border: isSelected ? '1px solid rgba(234, 234, 234, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                                color: isSelected ? '#dedede' : TEXT.muted,
                              }}
                            >
                              <CapabilityIcon type={tag.icon} color={isSelected ? '#dedede' : TEXT.muted} />
                              {tag.label}
                            </div>
                          );
                        })}
                      </div>

                      {/* Model list */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
                        {CUSTOM_MODELS.slice(0, 3).map((model, index) => {
                          const itemDelay = PHASE.modelsAppear.start + 5 + index * 8;
                          const itemProgress = spring({
                            frame: frame - itemDelay,
                            fps,
                            config: { damping: 25, stiffness: 180 },
                            durationInFrames: 18,
                          });

                          const itemOpacity = interpolate(itemProgress, [0, 0.5], [0, 1], {
                            extrapolateRight: 'clamp',
                          });
                          const itemX = interpolate(itemProgress, [0, 1], [25, 0]);
                          const reorderOffset = getModelOffset(index);
                          const isDragging = index === 0 && reorderProgress > 0;

                          // Assign role to GPT-4o (index 1)
                          const assignedRole: RoleName | null = showRoleBadge && index === 1 ? 'Researcher' : null;

                          return (
                            <div
                              key={model.provider}
                              style={{
                                opacity: itemOpacity,
                                transform: `translateX(${itemX}px) translateY(${reorderOffset}px)`,
                                zIndex: isDragging ? 10 : 1,
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 12,
                                  padding: '14px 16px',
                                  borderRadius: 14,
                                  backgroundColor: isDragging
                                    ? 'rgba(0, 0, 0, 0.3)'
                                    : model.selected
                                      ? 'rgba(255, 255, 255, 0.05)'
                                      : 'transparent',
                                  backdropFilter: isDragging ? 'blur(24px)' : 'none',
                                  boxShadow: isDragging ? '0px 10px 30px rgba(0, 0, 0, 0.5)' : 'none',
                                }}
                              >
                                <VideoDragHandle />
                                <VideoAvatar provider={model.provider} fallback={model.name} size={44} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                    <span
                                      style={{
                                        fontSize: 15,
                                        fontWeight: 600,
                                        color: TEXT.primary,
                                      }}
                                    >
                                      {model.name}
                                    </span>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      {model.capabilities.slice(0, 2).map(cap => (
                                        <span
                                          key={cap}
                                          style={{
                                            padding: '3px 7px',
                                            borderRadius: 5,
                                            fontSize: 10,
                                            fontWeight: 500,
                                            backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                            color: TEXT.muted,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px',
                                          }}
                                        >
                                          {cap}
                                        </span>
                                      ))}
                                    </div>
                                    {assignedRole && (
                                      <div style={{ opacity: roleAssignProgress, transform: `scale(${roleAssignProgress})` }}>
                                        <RoleBadge role={assignedRole} showClear />
                                      </div>
                                    )}
                                  </div>
                                  <span
                                    style={{
                                      fontSize: 13,
                                      color: TEXT.muted,
                                    }}
                                  >
                                    {model.description}
                                  </span>
                                </div>
                                {/* Toggle switch */}
                                <div
                                  style={{
                                    width: 40,
                                    height: 22,
                                    borderRadius: 9999,
                                    backgroundColor: model.selected ? '#dedede' : '#3a3a3a',
                                    position: 'relative',
                                    flexShrink: 0,
                                  }}
                                >
                                  <div
                                    style={{
                                      position: 'absolute',
                                      top: 2,
                                      left: model.selected ? 20 : 2,
                                      width: 18,
                                      height: 18,
                                      borderRadius: 9999,
                                      backgroundColor: '#ffffff',
                                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div
                  style={{
                    padding: '16px 24px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 14, color: TEXT.muted }}>
                    2 models selected
                  </span>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div
                      style={{
                        padding: '10px 20px',
                        borderRadius: 10,
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        fontSize: 14,
                        fontWeight: 500,
                        color: TEXT.muted,
                      }}
                    >
                      Cancel
                    </div>
                    <div
                      style={{
                        padding: '10px 20px',
                        borderRadius: 10,
                        backgroundColor: '#ffffff',
                        fontSize: 14,
                        fontWeight: 500,
                        color: '#000000',
                      }}
                    >
                      Apply
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </BrowserFrame>
      </div>
    </AbsoluteFill>
  );
}
