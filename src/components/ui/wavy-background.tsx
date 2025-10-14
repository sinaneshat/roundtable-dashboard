'use client';

import { cn } from '@/lib/ui/cn';
import React, { useEffect, useRef, useState } from 'react';
import { createNoise3D } from 'simplex-noise';

export const WavyBackground = ({
  children,
  className,
  containerClassName,
  colors,
  waveWidth,
  backgroundFill,
  blur = 10,
  speed = 'fast',
  waveOpacity = 0.5,
  ...props
}: {
  children?: React.ReactNode;
  className?: string;
  containerClassName?: string;
  colors?: string[];
  waveWidth?: number;
  backgroundFill?: string;
  blur?: number;
  speed?: 'slow' | 'fast';
  waveOpacity?: number;
  [key: string]: unknown;
}) => {
  // Use ref to preserve noise function across re-renders
  const noiseRef = useRef(createNoise3D());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ✅ REACT 19 PATTERN: Compute Safari detection during initialization, not in useEffect
  // This is a one-time computation that doesn't change, so no useEffect needed
  const [isSafari] = useState(() =>
    typeof window !== 'undefined' &&
    navigator.userAgent.includes('Safari') &&
    !navigator.userAgent.includes('Chrome')
  );

  const getSpeed = () => {
    switch (speed) {
      case 'slow':
        return 0.001;
      case 'fast':
        return 0.002;
      default:
        return 0.001;
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use parent container dimensions to prevent overflow
    const updateCanvasSize = () => {
      const parent = canvas.parentElement;
      if (!parent) return { width: 0, height: 0 };

      const rect = parent.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    };

    const { width, height } = updateCanvasSize();
    let w = (ctx.canvas.width = width);
    let h = (ctx.canvas.height = height);
    ctx.filter = `blur(${blur}px)`;
    let nt = 0;

    const handleResize = () => {
      const { width: newWidth, height: newHeight } = updateCanvasSize();
      w = ctx.canvas.width = newWidth;
      h = ctx.canvas.height = newHeight;
      ctx.filter = `blur(${blur}px)`;
    };

    window.addEventListener('resize', handleResize);

    // Roundtable logo colors - muted/desaturated versions
    const waveColors = colors ?? [
      'rgba(218, 165, 32, 0.15)',   // Muted Gold/Yellow
      'rgba(154, 205, 50, 0.15)',   // Muted Olive Green
      'rgba(64, 224, 208, 0.15)',   // Muted Turquoise
      'rgba(147, 112, 219, 0.15)',  // Muted Purple
      'rgba(219, 112, 147, 0.15)',  // Muted Pink
    ];

    const drawWave = (n: number) => {
      nt += getSpeed();
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.lineWidth = waveWidth || 40;
        ctx.strokeStyle = waveColors[i % waveColors.length] || 'rgba(218, 165, 32, 0.15)';
        for (let x = 0; x < w; x += 5) {
          const y = noiseRef.current(x / 800, 0.3 * i, nt) * 80;
          ctx.lineTo(x, y + h * 0.5);
        }
        ctx.stroke();
        ctx.closePath();
      }
    };

    let animationId: number;
    const render = () => {
      ctx.fillStyle = backgroundFill || 'black';
      ctx.globalAlpha = waveOpacity || 0.3;
      ctx.fillRect(0, 0, w, h);
      drawWave(5);
      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, [blur, backgroundFill, colors, speed, waveOpacity, waveWidth]);

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden',
        containerClassName,
      )}
    >
      <canvas
        className="absolute inset-0 z-0 h-full w-full"
        ref={canvasRef}
        id="canvas"
        style={{
          ...(isSafari ? { filter: `blur(${blur}px)` } : {}),
        }}
      />
      <div className={cn('relative z-10', className)} {...props}>
        {children}
      </div>
    </div>
  );
};
