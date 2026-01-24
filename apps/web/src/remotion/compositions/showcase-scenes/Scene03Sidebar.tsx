/**
 * Scene 3: Sidebar & Navigation
 * Duration: 4-5.5s (75 frames at 30fps)
 *
 * Camera: Pan from sidebar to main content with subtle zoom
 * Content: Sidebar with threads, projects, user menu
 * 3D Effect: Sidebar slides in from left with depth shadow
 *
 * Cinematic Effects:
 * - Slide-in with spring physics
 * - Subtle breathing motion on background
 * - Focus pull on sidebar
 * - Staggered item animations
 *
 * Matches actual app components:
 * - @/components/chat/chat-nav.tsx (AppSidebar)
 * - @/components/chat/chat-list.tsx (ChatList, ChatItem)
 * - @/components/chat/nav-user.tsx (NavUser)
 * - @/components/ui/sidebar.tsx (Sidebar UI primitives)
 */

import type { CSSProperties } from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

import { BrowserFrame } from '../../components/BrowserFrame';
import { DepthParticles, EdgeVignette } from '../../components/scene-primitives';
import { VideoFeatureCaptions } from '../../components/ui-replicas';
import { useCinematicCamera, useFocusPull } from '../../hooks';
import { BACKGROUNDS, SPACING } from '../../lib/design-tokens';

// Dark theme colors from globals.css - matching actual app
const SIDEBAR_COLORS = {
  sidebar: '#282828', // oklch(0.22 0 0) - --sidebar in dark mode
  sidebarForeground: '#dedede', // oklch(0.87 0 0) - --sidebar-foreground
  sidebarAccent: '#3a3a3a', // oklch(0.269 0 0) - --sidebar-accent
  sidebarBorder: 'rgba(77, 77, 77, 0.6)', // oklch(0.4 0 0 / 60%) - --sidebar-border
  mutedForeground: '#a3a3a3', // oklch(0.75 0 0) - --muted-foreground
  borderWhite10: 'rgba(255, 255, 255, 0.1)',
  borderWhite5: 'rgba(255, 255, 255, 0.05)',
};

// Demo threads matching actual ChatList structure (no icons, just titles)
const DEMO_THREADS = [
  { id: '1', title: 'Architecture Discussion', isActive: true },
  { id: '2', title: 'AI Model Performance Comparison', isActive: false },
  { id: '3', title: 'API Design Review', isActive: false },
  { id: '4', title: 'Technical Architecture Review', isActive: false },
  { id: '5', title: 'Real-time Features Analysis', isActive: false },
];

// Demo projects matching ProjectList component with colors
const DEMO_PROJECTS = [
  { id: 'p1', name: 'Product Ideas', color: '#3b82f6', threadCount: 12 },
  { id: 'p2', name: 'Research', color: '#10b981', threadCount: 8 },
  { id: 'p3', name: 'Marketing', color: '#f59e0b', threadCount: 5 },
];

// Cinematic spring config
const CINEMATIC_SPRING = { damping: 40, stiffness: 100, mass: 1.2 };

// Sidebar width
const SIDEBAR_WIDTH = 320;

export function Scene03Sidebar() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // === CINEMATIC CAMERA ===
  // Subtle pan right as sidebar reveals
  const { breathingOffset } = useCinematicCamera({
    movement: 'static',
    breathingEnabled: true,
    breathingIntensity: 2.5,
  });

  // Focus pull - blur to sharp
  const { filter: focusFilter } = useFocusPull({
    startFrame: 0,
    duration: 25,
    maxBlur: 5,
  });

  // Sidebar slide in with cinematic spring
  const sidebarProgress = spring({
    frame,
    fps,
    config: CINEMATIC_SPRING,
    durationInFrames: 25,
  });

  const sidebarX = interpolate(sidebarProgress, [0, 1], [-SIDEBAR_WIDTH, 0]);
  const sidebarOpacity = interpolate(sidebarProgress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Unified entrance zoom - same timing across all scenes
  const entranceZoom = interpolate(
    spring({ frame, fps, config: { damping: 25, stiffness: 150 }, durationInFrames: 25 }),
    [0, 1],
    [0.96, 1],
  );

  // Exit fade in last 10 frames
  const exitFade = frame > 65
    ? interpolate(frame, [65, 75], [1, 0], { extrapolateRight: 'clamp' })
    : 1;

  // Items stagger with cinematic spring
  const getItemProgress = (index: number) => {
    return spring({
      frame: frame - 15 - index * 4,
      fps,
      config: CINEMATIC_SPRING,
      durationInFrames: 20,
    });
  };

  // CSS styles matching actual components

  // Sidebar container - matches Sidebar component
  const sidebarStyles: CSSProperties = {
    width: SIDEBAR_WIDTH,
    height: '100%',
    backgroundColor: SIDEBAR_COLORS.sidebar,
    borderRight: `1px solid ${SIDEBAR_COLORS.sidebarBorder}`,
    transform: `translateX(${sidebarX}px)`,
    opacity: sidebarOpacity,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '10px 0 40px rgba(0, 0, 0, 0.3)',
    fontFamily: '\'Noto Sans\', system-ui, sans-serif',
  };

  // SidebarHeader
  const headerStyles: CSSProperties = {
    display: 'flex',
    height: 36,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 16px 0',
  };

  // SidebarMenuButton styles
  const menuButtonStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 16px',
    margin: '0 8px',
    borderRadius: 8,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    width: 'calc(100% - 16px)',
  };

  const menuButtonActiveStyles: CSSProperties = {
    ...menuButtonStyles,
    backgroundColor: SIDEBAR_COLORS.sidebarAccent,
  };

  // SidebarGroupLabel styles
  const sectionLabelStyles: CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
    color: SIDEBAR_COLORS.mutedForeground,
    padding: '16px 16px 8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  // Thread item styles
  const threadItemStyles = (isActive: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    margin: '0 8px 2px',
    borderRadius: 8,
    backgroundColor: isActive ? SIDEBAR_COLORS.borderWhite5 : 'transparent',
    cursor: 'pointer',
  });

  // Thread title styles
  const threadTitleStyles: CSSProperties = {
    fontSize: 14,
    fontWeight: 400,
    color: SIDEBAR_COLORS.sidebarForeground,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 200,
  };

  // SidebarFooter styles
  const footerStyles: CSSProperties = {
    marginTop: 'auto',
    padding: '8px 8px 12px',
  };

  // NavUser trigger styles
  const userMenuStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    width: '100%',
    minHeight: 44,
  };

  // User info container
  const userInfoStyles: CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  };

  // User name
  const userNameStyles: CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: SIDEBAR_COLORS.sidebarForeground,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.3,
  };

  // User email
  const userEmailStyles: CSSProperties = {
    fontSize: 12,
    color: SIDEBAR_COLORS.mutedForeground,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.3,
  };

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BACKGROUNDS.primary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: SPACING.lg,
        perspective: 1200,
        perspectiveOrigin: 'center center',
      }}
    >
      {/* Background Depth Particles - with breathing parallax */}
      <div
        style={{
          transform: `translate(${breathingOffset.x * 0.3}px, ${breathingOffset.y * 0.3}px)`,
        }}
      >
        <DepthParticles frame={frame} baseOpacity={0.35} count={18} />
      </div>

      {/* Edge Vignette */}
      <EdgeVignette innerRadius={50} edgeOpacity={0.5} />

      {/* Feature Captions */}
      <VideoFeatureCaptions
        position="bottom-left"
        captions={[
          { start: 0, end: 35, text: 'Organized workspace', subtitle: 'Projects and threads at a glance' },
          { start: 35, end: 75, text: 'Quick navigation', subtitle: 'Find any conversation instantly' },
        ]}
      />

      {/* Browser Frame Wrapper with zoom + scan animation */}
      <div
        style={{
          transform: `scale(${entranceZoom})`,
          transformOrigin: 'center center',
          filter: focusFilter,
          opacity: exitFade,
        }}
      >
        <BrowserFrame url="roundtable.ai">
          <div
            style={{
              display: 'flex',
              width: 1200,
              height: 700,
              overflow: 'hidden',
              backgroundColor: BACKGROUNDS.primary,
            }}
          >
            {/* Sidebar */}
            <div style={sidebarStyles}>
              {/* SidebarHeader */}
              <div style={headerStyles}>
                {/* Logo - just the icon */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px' }}>
                  <Img
                    src={staticFile('static/logo.webp')}
                    width={24}
                    height={24}
                    style={{ objectFit: 'contain' }}
                  />
                </div>
                {/* SidebarTrigger - panel toggle icon */}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={SIDEBAR_COLORS.mutedForeground} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M9 3v18" />
                  </svg>
                </div>
              </div>

              {/* SidebarMenu - New Chat & Search buttons */}
              <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* New Chat - active state */}
                <div style={menuButtonActiveStyles}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={SIDEBAR_COLORS.sidebarForeground} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span style={{ fontSize: 14, fontWeight: 500, color: SIDEBAR_COLORS.sidebarForeground }}>
                    New Chat
                  </span>
                </div>

                {/* Search Chats button */}
                <div style={menuButtonStyles}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={SIDEBAR_COLORS.mutedForeground} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <span style={{ fontSize: 14, fontWeight: 500, color: SIDEBAR_COLORS.mutedForeground }}>
                    Search chats
                  </span>
                </div>
              </div>

              {/* SidebarContent - Scrollable area */}
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* Projects Section */}
                <div style={sectionLabelStyles}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <span>Projects</span>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ transform: 'rotate(90deg)', opacity: 0.7 }}>
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </div>
                  {/* Add project button */}
                  <div style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={SIDEBAR_COLORS.mutedForeground} strokeWidth={2}>
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </div>
                </div>

                {/* ProjectList items */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {DEMO_PROJECTS.map((project, index) => {
                    const itemProgress = getItemProgress(index);
                    const itemOpacity = interpolate(itemProgress, [0, 0.5], [0, 1], {
                      extrapolateRight: 'clamp',
                    });
                    const itemX = interpolate(itemProgress, [0, 1], [15, 0]);

                    return (
                      <div
                        key={project.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 16px',
                          borderRadius: 8,
                          opacity: itemOpacity,
                          transform: `translateX(${itemX}px)`,
                        }}
                      >
                        {/* Chevron on LEFT */}
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={SIDEBAR_COLORS.mutedForeground} strokeWidth={2} style={{ opacity: 0.5 }}>
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                        {/* Icon badge instead of color dot */}
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 6,
                            backgroundColor: project.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}>
                            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                          </svg>
                        </div>
                        {/* Name only - NO count or right chevron */}
                        <span style={{ fontSize: 14, color: SIDEBAR_COLORS.sidebarForeground, flex: 1 }}>
                          {project.name}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Chats Section */}
                <div style={sectionLabelStyles}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <span>Chats</span>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ transform: 'rotate(90deg)', opacity: 0.7 }}>
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </div>
                </div>

                {/* ChatList items - just titles, no icons */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {DEMO_THREADS.map((thread, index) => {
                    const itemProgress = getItemProgress(index + DEMO_PROJECTS.length);
                    const itemOpacity = interpolate(itemProgress, [0, 0.5], [0, 1], {
                      extrapolateRight: 'clamp',
                    });
                    const itemX = interpolate(itemProgress, [0, 1], [15, 0]);

                    return (
                      <div
                        key={thread.id}
                        style={{
                          ...threadItemStyles(thread.isActive),
                          opacity: itemOpacity,
                          transform: `translateX(${itemX}px)`,
                        }}
                      >
                        <span style={threadTitleStyles}>{thread.title}</span>
                        {/* More menu icon - visible on active/hover */}
                        {thread.isActive && (
                          <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={SIDEBAR_COLORS.mutedForeground} strokeWidth={2}>
                              <circle cx="12" cy="12" r="1" fill="currentColor" />
                              <circle cx="19" cy="12" r="1" fill="currentColor" />
                              <circle cx="5" cy="12" r="1" fill="currentColor" />
                            </svg>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SidebarFooter - NavUser component */}
              <div style={footerStyles}>
                <div style={userMenuStyles}>
                  {/* Avatar - matches nav-user.tsx Avatar with gradient background */}
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9999,
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#ffffff',
                        fontFamily: '\'Noto Sans\', system-ui, sans-serif',
                      }}
                    >
                      AD
                    </span>
                  </div>
                  {/* User info - grid layout like nav-user.tsx */}
                  <div style={userInfoStyles}>
                    <span style={userNameStyles}>Alex Developer</span>
                    <span style={userEmailStyles}>alex@roundtable.ai</span>
                  </div>
                  {/* ChevronsUpDown icon - matches nav-user.tsx */}
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={SIDEBAR_COLORS.mutedForeground} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="m7 15 5 5 5-5" />
                    <path d="m7 9 5-5 5 5" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Main content - empty state, content not in focus */}
            <div
              style={{
                flex: 1,
                backgroundColor: BACKGROUNDS.primary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: sidebarOpacity * 0.5,
              }}
            />
          </div>
        </BrowserFrame>
      </div>
    </AbsoluteFill>
  );
}
