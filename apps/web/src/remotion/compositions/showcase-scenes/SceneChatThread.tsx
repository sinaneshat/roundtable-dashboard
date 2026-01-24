/**
 * Scene: Unified Chat Thread
 * Duration: 480 frames (16 seconds at 30fps)
 *
 * THE CORE FEATURE - Complete chat thread flow in ONE scene:
 * - Frame 0-30: User message slides up
 * - Frame 30-90: Web search accordion opens, streams results
 * - Frame 90-120: Web search accordion collapses
 * - Frame 120-150: First participant placeholder appears with shimmer
 * - Frame 150-210: Claude content streams (camera zoom focus)
 * - Frame 180-240: GPT-4o placeholder then streams (camera zoom)
 * - Frame 210-270: Gemini placeholder then streams (camera zoom)
 * - Frame 280-310: All complete, moderator placeholder with shimmer
 * - Frame 310-420: Moderator synthesis streams
 * - Frame 420-480: Hold on complete thread
 *
 * Key behaviors:
 * - overflow: hidden with translateY for auto-scroll (no scrollbar)
 * - Camera zoom effect on currently streaming participant
 * - Web search integrated in same scene
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
  VideoParticipantMessage,
  VideoParticipantPlaceholder,
  VideoPreSearchCard,
  VideoUserMessage,
} from '../../components/ui-replicas';
import { TypewriterText } from '../../components/video-primitives';
import { useCameraPan, useCinematicCamera, useFocusPull } from '../../hooks';
import { BACKGROUNDS, SPACING, TEXT } from '../../lib/design-tokens';

// Cinematic spring config
const CINEMATIC_SPRING = { damping: 40, stiffness: 100, mass: 1.2 };
const SMOOTH_SPRING = { damping: 30, stiffness: 80, mass: 1 };

// The user's question - technology focused (no SaaS)
const USER_QUESTION = 'Compare approaches for building real-time collaborative features';

// Web search results - technology focused
const SEARCH_RESULTS = [
  { domain: 'crdt.tech', title: 'CRDTs for Collaborative Editing', snippet: 'Conflict-free replicated data types enable seamless collaboration...' },
  { domain: 'realtimeapi.io', title: 'WebSocket vs Server-Sent Events', snippet: 'Comparing real-time communication protocols for modern apps...' },
  { domain: 'operationaltransform.org', title: 'Operational Transformation Explained', snippet: 'How Google Docs achieves real-time collaborative editing...' },
];

// AI responses with timing - technology focused
const AI_RESPONSES = [
  {
    provider: 'anthropic',
    modelName: 'Claude',
    loadingText: 'Analyzing collaboration patterns...',
    text: 'CRDTs offer the strongest consistency guarantees for distributed collaboration. Unlike OT, they handle offline edits gracefully and merge deterministically without a central server.',
    placeholderStart: 120,
    streamStart: 150,
    streamDuration: 60,
  },
  {
    provider: 'openai',
    modelName: 'GPT-4o',
    loadingText: 'Researching architectures...',
    text: 'Consider your latency requirements carefully. WebSockets provide bidirectional communication but require connection management. For simpler use cases, SSE with periodic polling can be more reliable.',
    placeholderStart: 150,
    streamStart: 180,
    streamDuration: 60,
  },
  {
    provider: 'google',
    modelName: 'Gemini',
    loadingText: 'Gathering technical insights...',
    text: 'Yjs and Automerge are battle-tested CRDT libraries. Yjs offers better performance for large documents, while Automerge has a more intuitive API for complex nested data structures.',
    placeholderStart: 180,
    streamStart: 210,
    streamDuration: 60,
  },
];

// Moderator synthesis
const MODERATOR_CONFIG = {
  modelName: 'Roundtable',
  loadingText: 'Synthesizing perspectives...',
  text: `The council recommends a layered approach:

1. Use CRDTs (Yjs/Automerge) for conflict-free state
2. WebSockets for low-latency updates
3. Operational Transform for cursor positions

Key tradeoff: CRDTs add storage overhead but eliminate merge conflicts entirely.`,
  placeholderStart: 280,
  streamStart: 310,
  streamDuration: 110,
};

// Timeline constants
const WEB_SEARCH_START = 30;
const WEB_SEARCH_COLLAPSE = 90;
const CONTENT_SCROLL_START = 150;

// Calculate which participant is currently streaming (for camera zoom)
function getCurrentStreamingIndex(frame: number): number {
  for (let i = AI_RESPONSES.length - 1; i >= 0; i--) {
    const response = AI_RESPONSES[i];
    if (!response)
      continue;
    if (frame >= response.streamStart && frame < response.streamStart + response.streamDuration) {
      return i;
    }
  }
  // Check if moderator is streaming
  if (frame >= MODERATOR_CONFIG.streamStart && frame < MODERATOR_CONFIG.streamStart + MODERATOR_CONFIG.streamDuration) {
    return AI_RESPONSES.length; // moderator index
  }
  return -1;
}

export function SceneChatThread() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // === CINEMATIC CAMERA ===
  // Enhanced breathing and orbit motion
  const { breathingOffset } = useCinematicCamera({
    movement: 'static',
    breathingEnabled: true,
    breathingIntensity: 2.5,
    orbitSpeed: 0.005,
  });

  // Focus pull on scene entrance - creates cinematic blur effect
  useFocusPull({
    startFrame: 0,
    duration: 25,
    maxBlur: 5,
  });

  // Camera pan as content scrolls (smooth follow)
  const { y: cameraPanY } = useCameraPan({
    segments: [
      { frame: 0, y: 0 },
      { frame: 150, y: -20 },
      { frame: 280, y: -40 },
      { frame: 420, y: -60 },
    ],
    transitionDuration: 60,
  });

  // === CONTAINER ANIMATION ===
  const containerProgress = spring({
    frame,
    fps,
    config: CINEMATIC_SPRING,
    durationInFrames: 25,
  });

  const containerOpacity = interpolate(containerProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // === CAMERA ZOOM EFFECT ===
  // Zoom in slightly on the currently streaming participant
  const currentStreamingIndex = getCurrentStreamingIndex(frame);
  const isAnyStreaming = currentStreamingIndex >= 0;

  // Smooth zoom transition - enhanced
  const zoomProgress = spring({
    frame: isAnyStreaming ? 10 : 0,
    fps,
    config: SMOOTH_SPRING,
    durationInFrames: 30,
  });

  const cameraScale = interpolate(zoomProgress, [0, 1], [1, 1.025], {
    extrapolateRight: 'clamp',
  });

  // Subtle camera movement - enhanced with breathing
  const orbitX = Math.sin(frame * 0.006) * 2 + breathingOffset.x * 0.5;
  const orbitY = Math.cos(frame * 0.004) * 1.5 + breathingOffset.y * 0.5;

  // === AUTO-SCROLL via translateY (no scrollbar) ===
  // Content scrolls up as more participants appear
  const scrollOffset = (() => {
    if (frame < CONTENT_SCROLL_START)
      return 0;

    // Calculate how much to scroll based on visible content
    const scrollProgress = interpolate(
      frame,
      [CONTENT_SCROLL_START, 280, 340, 420],
      [0, 120, 200, 280],
      { extrapolateRight: 'clamp' },
    );

    return scrollProgress;
  })();

  // === USER MESSAGE ===
  const userMsgProgress = spring({
    frame,
    fps,
    config: CINEMATIC_SPRING,
    durationInFrames: 20,
  });

  const userMsgOpacity = interpolate(userMsgProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const userMsgY = interpolate(userMsgProgress, [0, 1], [30, 0]);

  // === WEB SEARCH ===
  const webSearchProgress = spring({
    frame: frame - WEB_SEARCH_START,
    fps,
    config: CINEMATIC_SPRING,
    durationInFrames: 20,
  });
  const webSearchOpacity = frame >= WEB_SEARCH_START
    ? interpolate(webSearchProgress, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' })
    : 0;
  const webSearchY = interpolate(webSearchProgress, [0, 1], [20, 0]);

  // Web search streaming state
  const isWebSearchStreaming = frame >= WEB_SEARCH_START && frame < WEB_SEARCH_COLLAPSE;

  // Web search accordion open state - starts open, collapses at WEB_SEARCH_COLLAPSE
  const isWebSearchOpen = frame < WEB_SEARCH_COLLAPSE + 30;

  // === LABEL ===
  const labelProgress = spring({
    frame: frame - 5,
    fps,
    config: { damping: 200 },
    durationInFrames: 20,
  });
  const labelOpacity = interpolate(labelProgress, [0, 1], [0, 1]);
  const labelY = interpolate(labelProgress, [0, 1], [20, 0]);

  // Dynamic label
  const getLabelText = () => {
    if (frame < WEB_SEARCH_START)
      return 'Multiple perspectives. Real-time.';
    if (frame < WEB_SEARCH_COLLAPSE)
      return 'Searching for relevant context';
    if (frame < 280)
      return 'Each AI brings unique insights';
    if (frame < MODERATOR_CONFIG.streamStart)
      return 'The Moderator synthesizes';
    return 'Unified insights from the council';
  };

  // === PARTICIPANT RENDERING ===
  const renderParticipants = () => {
    return AI_RESPONSES.map((response, index) => {
      // Only show if past placeholder start
      if (frame < response.placeholderStart)
        return null;

      // Placeholder entrance animation
      const placeholderProgress = spring({
        frame: frame - response.placeholderStart,
        fps,
        config: CINEMATIC_SPRING,
        durationInFrames: 20,
      });

      const placeholderOpacity = interpolate(placeholderProgress, [0, 0.5], [0, 1], {
        extrapolateRight: 'clamp',
      });
      const placeholderY = interpolate(placeholderProgress, [0, 1], [30, 0]);

      // Is showing placeholder vs streaming content?
      const isPlaceholder = frame < response.streamStart;
      const isStreaming = frame >= response.streamStart && frame < response.streamStart + response.streamDuration;
      const isCurrentlyStreaming = currentStreamingIndex === index;

      // Calculate streaming progress for text
      const charsPerFrame = response.text.length / response.streamDuration;

      // Zoom highlight for currently streaming participant
      const highlightScale = isCurrentlyStreaming
        ? interpolate(
            spring({ frame: 5, fps, config: SMOOTH_SPRING, durationInFrames: 15 }),
            [0, 1],
            [1, 1.01],
          )
        : 1;

      const wrapperStyle: CSSProperties = {
        opacity: placeholderOpacity,
        transform: `translateY(${placeholderY}px) scale(${highlightScale})`,
        transformOrigin: 'top left',
      };

      return (
        <div key={response.provider} style={wrapperStyle}>
          {isPlaceholder
            ? (
                <VideoParticipantPlaceholder
                  modelName={response.modelName}
                  provider={response.provider}
                  loadingText={response.loadingText}
                />
              )
            : (
                <VideoParticipantMessage
                  modelName={response.modelName}
                  provider={response.provider}
                  showStreamingIndicator={isStreaming}
                >
                  <TypewriterText
                    text={response.text}
                    delay={response.streamStart}
                    charsPerFrame={charsPerFrame}
                  />
                </VideoParticipantMessage>
              )}
        </div>
      );
    });
  };

  // === MODERATOR RENDERING ===
  const renderModerator = () => {
    if (frame < MODERATOR_CONFIG.placeholderStart)
      return null;

    const modPlaceholderProgress = spring({
      frame: frame - MODERATOR_CONFIG.placeholderStart,
      fps,
      config: CINEMATIC_SPRING,
      durationInFrames: 25,
    });

    const modOpacity = interpolate(modPlaceholderProgress, [0, 0.5], [0, 1], {
      extrapolateRight: 'clamp',
    });
    const modY = interpolate(modPlaceholderProgress, [0, 1], [40, 0]);

    const isModPlaceholder = frame < MODERATOR_CONFIG.streamStart;
    const isModStreaming = frame >= MODERATOR_CONFIG.streamStart
      && frame < MODERATOR_CONFIG.streamStart + MODERATOR_CONFIG.streamDuration;
    const isModCurrentlyStreaming = currentStreamingIndex === AI_RESPONSES.length;

    const modCharsPerFrame = MODERATOR_CONFIG.text.length / MODERATOR_CONFIG.streamDuration;

    // Zoom highlight for moderator when streaming
    const modHighlightScale = isModCurrentlyStreaming
      ? interpolate(
          spring({ frame: 5, fps, config: SMOOTH_SPRING, durationInFrames: 15 }),
          [0, 1],
          [1, 1.01],
        )
      : 1;

    const modStyle: CSSProperties = {
      opacity: modOpacity,
      transform: `translateY(${modY}px) scale(${modHighlightScale})`,
      transformOrigin: 'top left',
      marginTop: SPACING.lg,
    };

    return (
      <div style={modStyle}>
        {isModPlaceholder
          ? (
              <VideoParticipantPlaceholder
                modelName={MODERATOR_CONFIG.modelName}
                isModerator
                loadingText={MODERATOR_CONFIG.loadingText}
              />
            )
          : (
              <VideoParticipantMessage
                modelName={MODERATOR_CONFIG.modelName}
                isModerator
                showStreamingIndicator={isModStreaming}
              >
                <TypewriterText
                  text={MODERATOR_CONFIG.text}
                  delay={MODERATOR_CONFIG.streamStart}
                  charsPerFrame={modCharsPerFrame}
                />
              </VideoParticipantMessage>
            )}
      </div>
    );
  };

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BACKGROUNDS.primary,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: SPACING['2xl'],
        paddingTop: SPACING.lg,
        perspective: 1200,
        perspectiveOrigin: 'center center',
        fontFamily: '\'Noto Sans\', system-ui, sans-serif',
        overflow: 'hidden', // No scrollbar
      }}
    >
      {/* Background depth particles - with camera pan parallax */}
      <div
        style={{
          transform: `translate(${breathingOffset.x * 0.2}px, ${cameraPanY * 0.1 + breathingOffset.y * 0.2}px)`,
        }}
      >
        <DepthParticles frame={frame} baseOpacity={0.35} count={20} />
      </div>

      {/* Edge vignette */}
      <EdgeVignette innerRadius={55} edgeOpacity={0.6} />

      {/* Feature Label */}
      <div
        style={{
          position: 'absolute',
          top: 40,
          left: 60,
          opacity: labelOpacity,
          transform: `translateY(${labelY}px)`,
          zIndex: 100,
        }}
      >
        <span
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: TEXT.primary,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(10px)',
            padding: '10px 20px',
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          {getLabelText()}
        </span>
      </div>

      {/* Browser Frame with Messages Container */}
      <BrowserFrame url="roundtable.ai">
        {/* Inner container with camera zoom and auto-scroll via translateY */}
        <div
          style={{
            width: 1100,
            height: 650,
            display: 'flex',
            flexDirection: 'column',
            gap: SPACING.lg,
            padding: SPACING.lg,
            opacity: containerOpacity,
            transform: `
              translateX(${orbitX}px)
              translateY(${orbitY - scrollOffset}px)
              scale(${cameraScale})
            `,
            transformOrigin: 'top center',
            backgroundColor: BACKGROUNDS.primary,
            overflow: 'hidden', // No scrollbar - using translateY for auto-scroll
          }}
        >
          {/* User Message */}
          <div
            style={{
              opacity: userMsgOpacity,
              transform: `translateY(${userMsgY}px)`,
              marginBottom: SPACING.md,
            }}
          >
            <VideoUserMessage>{USER_QUESTION}</VideoUserMessage>
          </div>

          {/* Web Search Card - integrated in same scene */}
          {frame >= WEB_SEARCH_START && (
            <div
              style={{
                opacity: webSearchOpacity,
                transform: `translateY(${webSearchY}px)`,
                marginBottom: SPACING.sm,
              }}
            >
              <VideoPreSearchCard
                isOpen={isWebSearchOpen}
                isStreaming={isWebSearchStreaming}
                query="real-time collaborative features CRDT WebSocket"
                results={SEARCH_RESULTS}
                totalSources={9}
              />
            </div>
          )}

          {/* AI Participant Responses */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.lg }}>
            {renderParticipants()}
          </div>

          {/* Moderator Synthesis */}
          {renderModerator()}
        </div>
      </BrowserFrame>
    </AbsoluteFill>
  );
}
