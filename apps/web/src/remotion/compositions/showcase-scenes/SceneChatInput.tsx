/**
 * Scene: Unified Chat Input
 * Duration: 300 frames (10 seconds at 30fps)
 *
 * Timeline demonstrating all chat input features:
 * - Frame 0-30: Empty chat input appears (Manual mode)
 * - Frame 30-70: Show model selection button with avatars (Manual mode)
 * - Frame 70-100: Switch to Auto mode - model button disappears
 * - Frame 100-125: Drag overlay appears (user drags files over)
 * - Frame 125-170: File chips animate in (result of drop)
 * - Frame 170-210: Voice recording activates (RED mic, waveform)
 * - Frame 210-260: Text types in input
 * - Frame 260-300: Send button pulses, message sends
 */

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
  VideoAutoModeToggle,
  VideoAvatar,
  VideoFeatureCaptions,
  VideoFileChip,
  VideoVoiceVisualization,
} from '../../components/ui-replicas';
import { useCinematicCamera } from '../../hooks';
import { BACKGROUNDS, HEX_COLORS, SPACING, TEXT } from '../../lib/design-tokens';

// Spring config
const SPRING_CONFIG = { damping: 30, stiffness: 150, mass: 1 };

// Demo models for the toolbar
const DEMO_MODELS = [
  { provider: 'anthropic', name: 'Claude' },
  { provider: 'openai', name: 'GPT-4o' },
  { provider: 'google', name: 'Gemini' },
] as const;

// Demo files
const DEMO_FILES = [
  { filename: 'requirements.pdf', fileType: 'pdf' as const },
  { filename: 'mockup.png', fileType: 'image' as const },
  { filename: 'api-spec.ts', fileType: 'code' as const },
] as const;

const DEMO_QUESTION = 'Compare approaches for building real-time collaboration features';

// Stop Circle Icon (shown when recording)
function StopCircleIcon({ size = 18, color = HEX_COLORS.white }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

// Mic Icon
function MicIcon({ size = 18, color = TEXT.muted }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

export function SceneChatInput() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Camera breathing
  const { breathingOffset } = useCinematicCamera({
    movement: 'static',
    breathingEnabled: true,
    breathingIntensity: 3,
  });

  // Phase timing
  const PHASE = {
    inputAppear: { start: 0, end: 30 },
    modelButton: { start: 30, end: 70 },
    autoModeSwitch: { start: 70, end: 100 },
    dragOverlay: { start: 100, end: 125 },
    fileChips: { start: 125, end: 170 },
    voiceRecording: { start: 170, end: 210 },
    typing: { start: 210, end: 260 },
    send: { start: 260, end: 300 },
  };

  // Input container animation
  const inputProgress = spring({
    frame,
    fps,
    config: SPRING_CONFIG,
    durationInFrames: 25,
  });

  const inputScale = interpolate(inputProgress, [0, 1], [0.95, 1]);
  const inputOpacity = interpolate(inputProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const inputY = interpolate(inputProgress, [0, 1], [30, 0]);

  // Floating effect
  const floatY = Math.sin(frame * 0.04) * 3;

  // AUTO MODE STATE
  // Start in Manual, switch to Auto at frame 70
  const isAutoMode = frame >= PHASE.autoModeSwitch.start;
  const autoModeValue: 'auto' | 'manual' = isAutoMode ? 'auto' : 'manual';

  // Auto mode glow effect during transition
  const autoModeGlow = frame >= PHASE.autoModeSwitch.start && frame < PHASE.autoModeSwitch.end
    ? interpolate(frame - PHASE.autoModeSwitch.start, [0, 15, 30], [0, 1, 0.5])
    : 0;

  // MODEL BUTTON STATE
  // Only show in Manual mode (frames 30-70)
  const showModelButton = frame >= PHASE.modelButton.start && !isAutoMode;
  const modelButtonProgress = spring({
    frame: frame - PHASE.modelButton.start,
    fps,
    config: { damping: 20, stiffness: 200 },
    durationInFrames: 15,
  });
  const modelButtonOpacity = showModelButton
    ? interpolate(modelButtonProgress, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' })
    : 0;
  const modelButtonScale = showModelButton
    ? interpolate(modelButtonProgress, [0, 1], [0.8, 1])
    : 0;

  // Model button exit animation when switching to auto
  const modelButtonExitProgress = frame >= PHASE.autoModeSwitch.start
    ? spring({
        frame: frame - PHASE.autoModeSwitch.start,
        fps,
        config: { damping: 25, stiffness: 200 },
        durationInFrames: 12,
      })
    : 0;
  const modelButtonExitOpacity = interpolate(modelButtonExitProgress, [0, 1], [1, 0]);

  // FILE CHIPS STATE
  const showFiles = frame >= PHASE.fileChips.start && frame < PHASE.voiceRecording.start;

  // DRAG OVERLAY STATE
  const showDragOverlay = frame >= PHASE.dragOverlay.start && frame < PHASE.dragOverlay.end;
  const dragOverlayOpacity = showDragOverlay
    ? interpolate(frame - PHASE.dragOverlay.start, [0, 8, 17, 25], [0, 0.8, 0.8, 0])
    : 0;

  // VOICE RECORDING STATE
  const isVoiceActive = frame >= PHASE.voiceRecording.start && frame < PHASE.typing.start;

  // TYPING STATE
  const isTyping = frame >= PHASE.typing.start;
  const typingStartFrame = PHASE.typing.start;
  const charsPerFrame = 1.2;
  const charsToShow = Math.max(0, Math.floor((frame - typingStartFrame) * charsPerFrame));
  const displayedText = isTyping ? DEMO_QUESTION.slice(0, Math.min(charsToShow, DEMO_QUESTION.length)) : '';
  const cursorVisible = isTyping && (charsToShow < DEMO_QUESTION.length || (frame % 20 < 10));

  // SEND BUTTON STATE
  const isSending = frame >= PHASE.send.start;
  const sendPulse = isSending
    ? 1 + Math.sin((frame - PHASE.send.start) * 0.4) * 0.1
    : 1;

  // Exit fade in last 10 frames
  const exitFade = frame > 290
    ? interpolate(frame, [290, 300], [1, 0], { extrapolateRight: 'clamp' })
    : 1;

  // Unified entrance zoom - same timing across all scenes
  const entranceZoom = interpolate(
    spring({ frame, fps, config: { damping: 25, stiffness: 150 }, durationInFrames: 25 }),
    [0, 1],
    [0.96, 1],
  );

  // Chat box fixed width
  const CHAT_BOX_WIDTH = 600;

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
          transform: `translate(${breathingOffset.x * 0.25}px, ${breathingOffset.y * 0.25}px)`,
        }}
      >
        <DepthParticles frame={frame} baseOpacity={0.35} count={18} />
      </div>

      <EdgeVignette innerRadius={50} edgeOpacity={0.5} />

      {/* Prominent Feature Caption */}
      <VideoFeatureCaptions
        position="bottom-left"
        captions={[
          { start: 0, end: 30, text: 'Your AI workspace', subtitle: 'One input for multiple AI models' },
          { start: 30, end: 70, text: 'Choose your models', subtitle: 'Pick from 20+ AI models to participate' },
          { start: 70, end: 100, text: 'Smart mode selection', subtitle: 'Auto mode picks the best models for your question' },
          { start: 100, end: 125, text: 'Drag & drop files', subtitle: 'PDFs, images, code — any file type supported' },
          { start: 125, end: 170, text: 'Rich file support', subtitle: 'Context from your documents, shared with all models' },
          { start: 170, end: 210, text: 'Voice input', subtitle: 'Speak naturally, transcribed in real-time' },
          { start: 210, end: 260, text: 'Ask anything', subtitle: 'Get diverse perspectives from multiple AIs simultaneously' },
          { start: 260, end: 300, text: 'Send to the roundtable', subtitle: 'All selected models respond in parallel' },
        ]}
      />

      {/* Browser Frame with Chat Input */}
      <div style={{ transform: `scale(${entranceZoom})`, transformOrigin: 'center center', opacity: exitFade }}>
        <BrowserFrame url="roundtable.ai">
          <div
            style={{
              width: 1200,
              height: 700,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              backgroundColor: BACKGROUNDS.primary,
              transform: `scale(${inputScale}) translateY(${inputY + floatY}px)`,
              opacity: inputOpacity,
            }}
          >
            {/* Main Input Container (header + chat box) - no gap between siblings */}
            <div
              style={{
                width: CHAT_BOX_WIDTH,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Auto/Manual Toggle Header - no bottom border, seamless with input */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                  border: '1px solid rgba(77, 77, 77, 0.6)',
                  borderBottom: 'none',
                  backgroundColor: '#282828',
                  padding: '6px 8px',
                  overflow: 'hidden',
                }}
              >
                <VideoAutoModeToggle value={autoModeValue} />
              </div>

              {/* Chat Input Box - connects seamlessly to header */}
              <div
                style={{
                  position: 'relative',
                  borderTopLeftRadius: 0,
                  borderTopRightRadius: 0,
                  borderBottomLeftRadius: 16,
                  borderBottomRightRadius: 16,
                  border: '1px solid rgba(77, 77, 77, 0.6)',
                  borderTop: 'none',
                  marginTop: -1,
                  backgroundColor: '#282828',
                  boxShadow: autoModeGlow > 0
                    ? `0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 0 ${20 * autoModeGlow}px rgba(168, 85, 247, ${0.4 * autoModeGlow})`
                    : '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                {/* Drag Overlay - absolute positioned, first child (matches ChatInputDropzoneOverlay) */}
                {showDragOverlay && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                      backdropFilter: 'blur(16px)',
                      border: '2px dashed rgba(234, 234, 234, 0.5)',
                      borderRadius: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: dragOverlayOpacity,
                      zIndex: 50,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={HEX_COLORS.primary} strokeWidth={2}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span style={{ fontSize: 14, color: HEX_COLORS.primary, fontWeight: 500 }}>
                        Drop files here
                      </span>
                    </div>
                  </div>
                )}

                {/* Voice Recording Bar */}
                <VideoVoiceVisualization isActive={isVoiceActive} barCount={40} />

                {/* File Attachments Row (matches ChatInputAttachments position) */}
                {showFiles && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                      overflow: 'hidden',
                    }}
                  >
                    {DEMO_FILES.map((file, i) => {
                      const fileDelay = PHASE.fileChips.start + i * 8;
                      const fileProgress = spring({
                        frame: frame - fileDelay,
                        fps,
                        config: { damping: 20, stiffness: 200 },
                        durationInFrames: 15,
                      });
                      const fileOpacity = interpolate(fileProgress, [0, 0.5], [0, 1], {
                        extrapolateRight: 'clamp',
                      });
                      const fileX = interpolate(fileProgress, [0, 1], [-20, 0]);
                      const fileScale = interpolate(fileProgress, [0, 1], [0.9, 1]);

                      return (
                        <div
                          key={file.filename}
                          style={{
                            opacity: fileOpacity,
                            transform: `translateX(${fileX}px) scale(${fileScale})`,
                          }}
                        >
                          <VideoFileChip filename={file.filename} fileType={file.fileType} />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Textarea area */}
                <div style={{ padding: 16 }}>
                  <div
                    style={{
                      minHeight: 60,
                      fontSize: 16,
                      lineHeight: 1.625,
                      color: displayedText ? TEXT.primary : TEXT.muted,
                    }}
                  >
                    {displayedText || 'Ask anything...'}
                    {cursorVisible && displayedText && (
                      <span style={{ color: TEXT.primary, marginLeft: 1 }}>|</span>
                    )}
                  </div>
                </div>

                {/* Toolbar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 16px 12px',
                    overflow: 'hidden',
                  }}
                >
                  {/* Left side - Models (manual) + Mode (manual) + Attachment + Web Search (manual) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    {/* Models button - ONLY shown in Manual mode (frames 30-70) */}
                    {frame >= PHASE.modelButton.start && frame < PHASE.autoModeSwitch.end && (
                      <div
                        style={{
                          opacity: isAutoMode ? modelButtonExitOpacity : modelButtonOpacity,
                          transform: `scale(${isAutoMode ? 1 : modelButtonScale})`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          height: 36,
                          padding: '0 12px',
                          borderRadius: 12,
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          fontSize: 12,
                          fontWeight: 500,
                          color: TEXT.primary,
                        }}
                      >
                        {/* Avatar group */}
                        <div style={{ display: 'flex' }}>
                          {DEMO_MODELS.map((m, i) => (
                            <div
                              key={m.provider}
                              style={{
                                marginLeft: i === 0 ? 0 : -8,
                                zIndex: DEMO_MODELS.length - i,
                              }}
                            >
                              <VideoAvatar provider={m.provider} fallback={m.name} size={24} />
                            </div>
                          ))}
                        </div>
                        <span>Models</span>
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </div>
                    )}

                    {/* Mode button - ONLY shown in Manual mode */}
                    {!isAutoMode && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          height: 36,
                          padding: '0 12px',
                          borderRadius: 12,
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          fontSize: 12,
                          fontWeight: 500,
                          color: TEXT.primary,
                        }}
                      >
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
                          <path d="M9 18h6" />
                          <path d="M10 22h4" />
                        </svg>
                        <span>Brainstorm</span>
                      </div>
                    )}

                    {/* Attachment button - always visible */}
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 12,
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={TEXT.muted} strokeWidth={2}>
                        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                    </div>

                    {/* Web Search button - ONLY shown in Manual mode */}
                    {!isAutoMode && (
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={TEXT.muted} strokeWidth={2}>
                          <circle cx="12" cy="12" r="10" />
                          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Right side - Mic button + Send button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {/* Mic button - RED when recording, rounded-full, stopCircle icon */}
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 9999,
                        border: isVoiceActive ? 'none' : '1px solid rgba(255, 255, 255, 0.12)',
                        backgroundColor: isVoiceActive ? HEX_COLORS.destructive : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: isVoiceActive ? '0 0 20px rgba(220, 38, 38, 0.4)' : 'none',
                      }}
                    >
                      {isVoiceActive
                        ? <StopCircleIcon size={18} color={HEX_COLORS.white} />
                        : <MicIcon size={18} color={TEXT.muted} />}
                    </div>

                    {/* Send button (WHITE variant) */}
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 9999,
                        backgroundColor: HEX_COLORS.white,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transform: `scale(${sendPulse})`,
                        boxShadow: isSending ? '0 0 20px rgba(255, 255, 255, 0.3)' : 'none',
                      }}
                    >
                      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={HEX_COLORS.black} strokeWidth={2.5}>
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
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
