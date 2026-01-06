'use client';

import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/ui/cn';

const GLOW_COLORS = ['#FFD700', '#FF1493', '#673AB7', '#2196F3', '#00BCD4', '#4CAF50'] as const;
const DEFAULT_GLOW_COLOR = '#FFD700' as const;

type LogoGlowProps = {
  className?: string;
};

export function LogoGlow({ className }: LogoGlowProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const shouldAnimate = !prefersReducedMotion;

  // Color cycle array for smooth transitions (loops back to first color)
  const colorCycle = [...GLOW_COLORS, DEFAULT_GLOW_COLOR];

  return (
    <motion.div
      className={cn(
        'absolute inset-0 rounded-full blur-xl',
        className,
      )}
      animate={shouldAnimate ? {
        scale: [1, 1.15, 1],
        opacity: [0.2, 0.35, 0.2],
        backgroundColor: colorCycle,
      } : {}}
      transition={{
        scale: {
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        },
        opacity: {
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        },
        backgroundColor: {
          duration: 24,
          repeat: Infinity,
          ease: 'easeInOut',
        },
      }}
      style={{
        willChange: 'transform, opacity',
        backgroundColor: DEFAULT_GLOW_COLOR,
      }}
    />
  );
}
