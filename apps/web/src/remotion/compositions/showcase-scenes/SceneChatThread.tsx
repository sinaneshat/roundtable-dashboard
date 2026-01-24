/**
 * Scene: Unified Chat Thread
 * Duration: ~700 frames (23+ seconds at 30fps)
 *
 * THE CORE FEATURE - Complete chat thread flow in ONE scene:
 * - Frame 0-30: User message slides up
 * - Frame 30-80: Web search accordion opens, streams results
 * - Frame 80: Web search accordion collapses
 * - Frame 90: ALL participant placeholders + moderator placeholder appear simultaneously
 * - Frame 130-250: Claude streams first
 * - Frame 260-380: GPT-4o streams second
 * - Frame 390-510: Gemini streams third
 * - Frame 520-660: Moderator streams last (after all participants done)
 * - Frame 660+: Hold on complete thread
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
  VideoFeatureCaptions,
  VideoParticipantMessage,
  VideoParticipantPlaceholder,
  VideoPreSearchCard,
  VideoUserMessage,
} from '../../components/ui-replicas';
import { TypewriterText } from '../../components/video-primitives';
import { useCameraPan, useCinematicCamera, useFocusPull } from '../../hooks';
import { BACKGROUNDS, FONTS, SPACING } from '../../lib/design-tokens';

// Cinematic spring config
const CINEMATIC_SPRING = { damping: 40, stiffness: 100, mass: 1.2 };
const SMOOTH_SPRING = { damping: 30, stiffness: 80, mass: 1 };

// The user's question - technology focused (no SaaS)
const USER_QUESTION = 'Compare approaches for building real-time collaborative features';

// Web search results - technology focused with URLs
const SEARCH_RESULTS = [
  { domain: 'crdt.tech', url: 'https://crdt.tech/resources', title: 'CRDTs for Collaborative Editing', snippet: 'Conflict-free replicated data types enable seamless real-time collaboration without requiring a central coordination server. They mathematically guarantee eventual consistency.' },
  { domain: 'realtimeapi.io', url: 'https://realtimeapi.io/compare', title: 'WebSocket vs Server-Sent Events: Complete Guide', snippet: 'A comprehensive comparison of real-time communication protocols. WebSockets offer bidirectional low-latency communication while SSE provides simpler server-to-client streaming.' },
  { domain: 'yjs.dev', url: 'https://yjs.dev/docs/getting-started', title: 'Yjs: Shared Editing Framework', snippet: 'The most performant CRDT implementation available. Used by Notion, Linear, and other major collaborative applications for document synchronization.' },
];

// AI responses with timing - technology focused
const AI_RESPONSES = [
  {
    provider: 'anthropic',
    modelName: 'Claude',
    loadingText: 'Analyzing collaboration patterns...',
    text: `CRDTs (Conflict-Free Replicated Data Types) provide the strongest consistency guarantees for distributed collaboration. Unlike Operational Transform, they handle offline edits gracefully and merge deterministically without requiring a central server.

Key advantages of CRDTs:
\u2022 Automatic conflict resolution without user intervention
\u2022 Works offline with eventual consistency guaranteed
\u2022 No central coordination needed - truly peer-to-peer capable
\u2022 Libraries like Yjs and Automerge are production-ready

For your use case, I'd recommend starting with Yjs for its superior performance on large documents, then layering WebSocket transport on top for real-time sync.`,
    placeholderStart: 90,
    streamStart: 120,
    streamDuration: 90,
  },
  {
    provider: 'openai',
    modelName: 'GPT-4o',
    loadingText: 'Researching architectures...',
    text: `Consider your latency requirements carefully when choosing a real-time architecture. Here's a practical comparison:

WebSockets:
\u2022 Bidirectional, low-latency (sub-50ms)
\u2022 Requires connection management and reconnection logic
\u2022 Best for collaborative editing and live cursors

Server-Sent Events (SSE):
\u2022 Simpler to implement, works through proxies
\u2022 One-directional (server to client)
\u2022 Great for notifications and status updates

For collaborative features, I recommend a hybrid approach: WebSockets for real-time cursor positions and typing indicators, with CRDTs handling the document state to ensure consistency.`,
    placeholderStart: 90,
    streamStart: 230,
    streamDuration: 90,
  },
  {
    provider: 'google',
    modelName: 'Gemini',
    loadingText: 'Gathering technical insights...',
    text: `Yjs and Automerge are the two battle-tested CRDT libraries worth evaluating:

Yjs (recommended for performance):
\u2022 10-100x faster than Automerge for large documents
\u2022 Rich ecosystem: y-websocket, y-indexeddb, y-webrtc
\u2022 Used by Notion, Linear, and other major products
\u2022 Sub-document support for granular sync

Automerge (recommended for complex data):
\u2022 More intuitive API for nested objects and arrays
\u2022 Built-in change history and time travel
\u2022 Better TypeScript support out of the box
\u2022 Smaller bundle size

Both handle network partitions gracefully and guarantee eventual consistency without data loss.`,
    placeholderStart: 90,
    streamStart: 340,
    streamDuration: 90,
  },
];

// Moderator synthesis
const MODERATOR_CONFIG = {
  modelName: 'Council Moderator',
  loadingText: 'Observing discussion...',
  text: `Based on the council's analysis, here's the recommended architecture:

**Foundation Layer:** Use Yjs as your CRDT engine for document state management. Its performance characteristics and ecosystem make it the clear choice for production.

**Transport Layer:** WebSockets via y-websocket for real-time sync with automatic reconnection. Fall back to SSE for environments where WebSockets aren't available.

**Presence Layer:** Implement cursor positions and typing indicators as ephemeral WebSocket messages (not persisted in CRDT state).

**Key Trade-off:** CRDTs add ~20-30% storage overhead but completely eliminate merge conflicts and enable true offline-first capability.

This layered approach gives you the best of all worlds: consistency, performance, and developer experience.`,
  placeholderStart: 90,
  streamStart: 450,
  streamDuration: 110,
};

// Timeline constants
const WEB_SEARCH_START = 30;
const WEB_SEARCH_COLLAPSE = 80;
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

  // Exit fade in last 10 frames
  const exitFade = frame > 710
    ? interpolate(frame, [710, 720], [1, 0], { extrapolateRight: 'clamp' })
    : 1;

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
  const currentStreamingIndex = getCurrentStreamingIndex(frame);

  // Unified entrance zoom - same timing across all scenes
  const entranceZoom = interpolate(
    spring({ frame, fps, config: { damping: 25, stiffness: 150 }, durationInFrames: 25 }),
    [0, 1],
    [0.96, 1],
  );

  // === AUTO-SCROLL via translateY (no scrollbar) ===
  // Content scrolls up as conversation grows beyond 750px viewport
  const scrollOffset = interpolate(
    frame,
    [0, 80, 130, 220, 320, 420, 550],
    [0, 0, -150, -450, -700, -950, -1300],
    { extrapolateRight: 'clamp' },
  );

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
        justifyContent: 'center',
        padding: SPACING.lg,
        perspective: 1200,
        perspectiveOrigin: 'center center',
        fontFamily: FONTS.sans,
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
      <VideoFeatureCaptions
        position="bottom-left"
        captions={[
          { start: 0, end: 30, text: 'Ask your question', subtitle: 'All models receive the same prompt' },
          { start: 30, end: 90, text: 'Web-grounded answers', subtitle: 'Real-time search enriches AI responses' },
          { start: 90, end: 180, text: 'Multiple perspectives', subtitle: 'Each AI brings unique reasoning and knowledge' },
          { start: 180, end: 430, text: 'The roundtable in action', subtitle: 'Compare insights side by side' },
          { start: 430, end: 560, text: 'Moderator synthesis', subtitle: 'AI summarizes the best ideas from all models' },
        ]}
      />

      {/* Browser Frame with Messages Container */}
      <div
        style={{
          transform: `scale(${entranceZoom})`,
          transformOrigin: 'center center',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          opacity: exitFade,
        }}
      >
        <BrowserFrame url="roundtable.ai">
          {/* Fixed-size viewport - overflow hidden clips the scrolling content */}
          <div
            style={{
              width: 1200,
              height: 750,
              overflow: 'hidden',
              backgroundColor: BACKGROUNDS.primary,
              position: 'relative',
            }}
          >
            {/* Scrolling content - translates up as conversation grows */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 56,
                padding: '32px 48px',
                maxWidth: 896,
                margin: '0 auto',
                transform: `translateY(${scrollOffset}px)`,
                opacity: containerOpacity,
              }}
            >
              {/* User Message with typewriter effect */}
              <div style={{ opacity: userMsgOpacity, transform: `translateY(${userMsgY}px)` }}>
                <VideoUserMessage
                  text={frame < 20
                    ? USER_QUESTION.slice(0, Math.min(Math.floor(frame * 3), USER_QUESTION.length))
                    : USER_QUESTION}
                />
              </div>

              {/* Web Search - part of the same flow */}
              {frame >= WEB_SEARCH_START && (
                <div
                  style={{
                    opacity: webSearchOpacity,
                    transform: `translateY(${webSearchY}px)`,
                    marginTop: -36,
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

              {/* ALL participants in a sub-container with space-y-4 (16px) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {renderParticipants()}
              </div>

              {/* Moderator - same level as participants group */}
              {renderModerator()}
            </div>
          </div>
        </BrowserFrame>
      </div>
    </AbsoluteFill>
  );
}
