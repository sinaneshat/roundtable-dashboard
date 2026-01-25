/**
 * Floating Window Stack Component
 *
 * Multi-browser 3D layout system for displaying overlapping browser windows
 * with depth, parallax, and focus effects.
 */

import type { CSSProperties, ReactNode } from 'react';
import { useMemo } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import { CINEMATIC_SPRINGS } from '../lib/cinematic-springs';

// ============================================================================
// Types
// ============================================================================

export type FloatingWindow = {
  /** Unique identifier for the window */
  id: string;
  /** Z-depth offset (positive = further, negative = closer) */
  zOffset: number;
  /** X/Y position offset from center */
  position: { x: number; y: number };
  /** Scale factor */
  scale: number;
  /** Content to render */
  children?: ReactNode;
};

export type FloatingWindowStackProps = {
  /** Array of windows to display */
  windows: FloatingWindow[];
  /** ID of the currently focused window */
  focusedWindowId?: string;
  /** Camera position for parallax effect */
  cameraPosition?: { x: number; y: number };
  /** Base perspective value */
  perspective?: number;
  /** Aperture for depth blur */
  aperture?: number;
  /** Enable entrance animation */
  entranceAnimation?: boolean;
  /** Entrance animation stagger delay (frames) */
  entranceStagger?: number;
  /** Preset layout */
  preset?: FloatingStackPreset;
};

export type FloatingStackPreset = 'cascade' | 'spread' | 'heroWithContext';

// ============================================================================
// Preset Configurations
// ============================================================================

const STACK_PRESETS: Record<FloatingStackPreset, Omit<FloatingWindow, 'id' | 'children'>[]> = {
  /**
   * Cascade - windows stacked diagonally
   */
  cascade: [
    { zOffset: -100, position: { x: -60, y: -40 }, scale: 0.85 },
    { zOffset: -50, position: { x: -30, y: -20 }, scale: 0.9 },
    { zOffset: 0, position: { x: 0, y: 0 }, scale: 1 },
  ],

  /**
   * Spread - windows spread horizontally
   */
  spread: [
    { zOffset: -80, position: { x: -200, y: 20 }, scale: 0.75 },
    { zOffset: 0, position: { x: 0, y: 0 }, scale: 1 },
    { zOffset: -80, position: { x: 200, y: 20 }, scale: 0.75 },
  ],

  /**
   * Hero with context - main window front, context windows behind
   */
  heroWithContext: [
    { zOffset: -150, position: { x: -180, y: 30 }, scale: 0.7 },
    { zOffset: -150, position: { x: 180, y: 30 }, scale: 0.7 },
    { zOffset: 0, position: { x: 0, y: 0 }, scale: 1 },
  ],
};

// ============================================================================
// Component
// ============================================================================

export function FloatingWindowStack({
  windows,
  focusedWindowId,
  cameraPosition = { x: 0, y: 0 },
  perspective = 1500,
  aperture = 2.8,
  entranceAnimation = true,
  entranceStagger = 8,
  preset,
}: FloatingWindowStackProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Apply preset if provided
  const resolvedWindows = useMemo(() => {
    if (preset && STACK_PRESETS[preset]) {
      const presetConfig = STACK_PRESETS[preset];
      return windows.map((window, idx) => {
        const config = presetConfig[idx % presetConfig.length];
        if (!config)
          return window;
        return {
          ...window,
          zOffset: window.zOffset ?? config.zOffset,
          position: window.position ?? config.position,
          scale: window.scale ?? config.scale,
        };
      });
    }
    return windows;
  }, [windows, preset]);

  // Sort windows by z-depth for correct rendering order (back to front)
  const sortedWindows = useMemo(() => {
    return [...resolvedWindows].sort((a, b) => b.zOffset - a.zOffset);
  }, [resolvedWindows]);

  return (
    <AbsoluteFill
      style={{
        perspective: `${perspective}px`,
        perspectiveOrigin: '50% 50%',
      }}
    >
      {sortedWindows.map((window) => {
        // Find original index for entrance delay
        const originalIndex = resolvedWindows.findIndex(w => w.id === window.id);

        // Entrance animation
        let entranceProgress = 1;
        if (entranceAnimation) {
          const delay = originalIndex * entranceStagger;
          entranceProgress = spring({
            frame: frame - delay,
            fps,
            config: CINEMATIC_SPRINGS.reveal,
            durationInFrames: 35,
          });
        }

        // Parallax based on camera position and window depth
        const parallaxFactor = 1 - window.zOffset / 300;
        const parallaxX = cameraPosition.x * parallaxFactor * 0.3;
        const parallaxY = cameraPosition.y * parallaxFactor * 0.3;

        // Blur based on distance from focus
        const isFocused = focusedWindowId
          ? window.id === focusedWindowId
          : window.zOffset === 0;
        const distanceFromFocus = Math.abs(window.zOffset);
        const blur = isFocused ? 0 : distanceFromFocus * (8 / aperture) * 0.08;

        // Opacity - focused window is full opacity, others fade
        const baseOpacity = isFocused ? 1 : 0.7 - distanceFromFocus / 500;
        const opacity = interpolate(entranceProgress, [0, 0.5, 1], [0, baseOpacity * 0.8, baseOpacity], {
          extrapolateRight: 'clamp',
        });

        // Entrance transform
        const entranceY = interpolate(entranceProgress, [0, 1], [40, 0]);
        const entranceScale = interpolate(entranceProgress, [0, 1], [0.9, 1]);

        // Final position
        const finalX = window.position.x + parallaxX;
        const finalY = window.position.y + parallaxY + entranceY;
        const finalScale = window.scale * entranceScale;

        // Z-index based on depth
        const zIndex = 100 - Math.floor(window.zOffset);

        const style: CSSProperties = {
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `
            translateX(-50%)
            translateY(-50%)
            translateX(${finalX}px)
            translateY(${finalY}px)
            translateZ(${-window.zOffset}px)
            scale(${finalScale})
          `,
          filter: blur > 0.5 ? `blur(${blur}px)` : undefined,
          opacity,
          zIndex,
          transformStyle: 'preserve-3d' as const,
          backfaceVisibility: 'hidden' as const,
          willChange: 'transform, opacity, filter',
        };

        return (
          <div key={window.id} style={style}>
            {window.children}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

// ============================================================================
// Preset Wrapper Components
// ============================================================================

type PresetStackProps = {
  children: ReactNode[];
  focusedIndex?: number;
  cameraPosition?: { x: number; y: number };
  entranceAnimation?: boolean;
};

/**
 * Cascade stack - windows stacked diagonally
 */
export function CascadeStack({
  children,
  focusedIndex = children.length - 1,
  cameraPosition,
  entranceAnimation = true,
}: PresetStackProps) {
  const windows: FloatingWindow[] = children.map((child, idx) => ({
    id: `cascade-${idx}`,
    zOffset: STACK_PRESETS.cascade[idx % 3]?.zOffset ?? 0,
    position: STACK_PRESETS.cascade[idx % 3]?.position ?? { x: 0, y: 0 },
    scale: STACK_PRESETS.cascade[idx % 3]?.scale ?? 1,
    children: child,
  }));

  return (
    <FloatingWindowStack
      windows={windows}
      focusedWindowId={`cascade-${focusedIndex}`}
      cameraPosition={cameraPosition}
      entranceAnimation={entranceAnimation}
      preset="cascade"
    />
  );
}

/**
 * Spread stack - windows spread horizontally
 */
export function SpreadStack({
  children,
  focusedIndex = Math.floor(children.length / 2),
  cameraPosition,
  entranceAnimation = true,
}: PresetStackProps) {
  const windows: FloatingWindow[] = children.map((child, idx) => ({
    id: `spread-${idx}`,
    zOffset: STACK_PRESETS.spread[idx % 3]?.zOffset ?? 0,
    position: STACK_PRESETS.spread[idx % 3]?.position ?? { x: 0, y: 0 },
    scale: STACK_PRESETS.spread[idx % 3]?.scale ?? 1,
    children: child,
  }));

  return (
    <FloatingWindowStack
      windows={windows}
      focusedWindowId={`spread-${focusedIndex}`}
      cameraPosition={cameraPosition}
      entranceAnimation={entranceAnimation}
      preset="spread"
    />
  );
}

/**
 * Hero with context stack - main window front center
 */
export function HeroContextStack({
  children,
  cameraPosition,
  entranceAnimation = true,
}: PresetStackProps) {
  const windows: FloatingWindow[] = children.map((child, idx) => ({
    id: `hero-${idx}`,
    zOffset: STACK_PRESETS.heroWithContext[idx % 3]?.zOffset ?? 0,
    position: STACK_PRESETS.heroWithContext[idx % 3]?.position ?? { x: 0, y: 0 },
    scale: STACK_PRESETS.heroWithContext[idx % 3]?.scale ?? 1,
    children: child,
  }));

  // Hero (last added) is always focused
  const heroIndex = children.length - 1;

  return (
    <FloatingWindowStack
      windows={windows}
      focusedWindowId={`hero-${heroIndex}`}
      cameraPosition={cameraPosition}
      entranceAnimation={entranceAnimation}
      preset="heroWithContext"
    />
  );
}
