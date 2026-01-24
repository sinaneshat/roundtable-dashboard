/**
 * Video Primitives
 * Frame-based animated wrapper components for Remotion
 * These replace motion/react components with Remotion-compatible alternatives
 */

import type { CSSProperties, ReactNode } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import { cn } from '@/lib/ui/cn';

import { SPRING_CONFIGS } from '../lib/easing';

type FadeInProps = {
  children: ReactNode;
  delay?: number;
  durationInFrames?: number;
  className?: string;
  style?: CSSProperties;
};

export function FadeIn({ children, delay = 0, durationInFrames = 20, className, style }: FadeInProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = spring({
    frame: frame - delay,
    fps,
    config: SPRING_CONFIGS.smooth,
    durationInFrames,
  });

  return (
    <div className={className} style={{ ...style, opacity }}>
      {children}
    </div>
  );
}

type ScaleInProps = {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  startScale?: number;
};

export function ScaleIn({ children, delay = 0, className, style, startScale = 0.8 }: ScaleInProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: SPRING_CONFIGS.snappy,
  });

  const scale = interpolate(progress, [0, 1], [startScale, 1]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  return (
    <div
      className={className}
      style={{
        ...style,
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      {children}
    </div>
  );
}

type SlideInProps = {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number;
};

export function SlideIn({
  children,
  delay = 0,
  className,
  style,
  direction = 'up',
  distance = 40,
}: SlideInProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: SPRING_CONFIGS.smooth,
  });

  const directionMap = {
    up: { x: 0, y: distance },
    down: { x: 0, y: -distance },
    left: { x: distance, y: 0 },
    right: { x: -distance, y: 0 },
  };

  const { x: startX, y: startY } = directionMap[direction];
  const x = interpolate(progress, [0, 1], [startX, 0]);
  const y = interpolate(progress, [0, 1], [startY, 0]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  return (
    <div
      className={className}
      style={{
        ...style,
        transform: `translate(${x}px, ${y}px)`,
        opacity,
      }}
    >
      {children}
    </div>
  );
}

type PopInProps = {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
};

export function PopIn({ children, delay = 0, className, style }: PopInProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: SPRING_CONFIGS.bouncy,
  });

  const scale = interpolate(progress, [0, 1], [0, 1]);
  const opacity = interpolate(progress, [0, 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      className={className}
      style={{
        ...style,
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      {children}
    </div>
  );
}

type TypewriterTextProps = {
  text: string;
  delay?: number;
  charsPerFrame?: number;
  className?: string;
  style?: CSSProperties;
};

export function TypewriterText({
  text,
  delay = 0,
  charsPerFrame = 0.5,
  className,
  style,
}: TypewriterTextProps) {
  const frame = useCurrentFrame();
  const adjustedFrame = Math.max(0, frame - delay);
  const charsToShow = Math.floor(adjustedFrame * charsPerFrame);
  const displayText = text.slice(0, Math.min(charsToShow, text.length));

  return (
    <span className={className} style={style}>
      {displayText}
      {charsToShow < text.length && (
        <span className="animate-blink">|</span>
      )}
    </span>
  );
}

type GlowingBorderProps = {
  children: ReactNode;
  delay?: number;
  className?: string;
  colors?: string[];
};

export function GlowingBorder({
  children,
  delay = 0,
  className,
  colors = ['#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24'],
}: GlowingBorderProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: SPRING_CONFIGS.smooth,
  });

  // Animate gradient rotation
  const rotation = interpolate(frame, [0, 300], [0, 360]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  const gradient = `linear-gradient(${rotation}deg, ${colors.join(', ')})`;

  return (
    <div
      className={cn('relative rounded-2xl p-[2px]', className)}
      style={{
        background: gradient,
        opacity,
      }}
    >
      <div className="relative z-10 rounded-[14px] bg-[#0a0a0a]">
        {children}
      </div>
    </div>
  );
}

type AbsoluteFillProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function AbsoluteFill({ children, className, style }: AbsoluteFillProps) {
  return (
    <div
      className={cn('absolute inset-0', className)}
      style={style}
    >
      {children}
    </div>
  );
}
