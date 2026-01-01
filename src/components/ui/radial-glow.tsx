'use client';

import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/ui/cn';

type RadialGlowProps = {
  size?: number;
  duration?: number;
  animate?: boolean;
  offsetY?: number;
  className?: string;
};

export const RadialGlow = ({
  size = 800,
  duration = 12,
  animate = true,
  offsetY = 0,
  className = '',
}: RadialGlowProps = {}) => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const shouldAnimate = animate && !prefersReducedMotion;

  return (
    <div
      className={cn('absolute left-1/2 top-1/2 pointer-events-none size-0 -z-10', className)}
    >
      <motion.div
        initial={{ opacity: 0.5 }}
        animate={{
          opacity: shouldAnimate ? [0.5, 0.65, 0.5] : 0.55,
          scale: shouldAnimate ? [1, 1.03, 1] : 1,
        }}
        transition={{
          opacity: {
            duration: 0.8,
            delay: 0.1,
            ease: 'easeOut',
          },
          scale: {
            duration,
            repeat: shouldAnimate ? Infinity : 0,
            repeatType: 'reverse',
            ease: 'easeInOut',
          },
        }}
        className="absolute will-change-transform"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          left: `${-size / 2}px`,
          top: `calc(-50% + ${offsetY}px)`,
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <motion.div
          className="absolute inset-0 rounded-full will-change-transform"
          style={{
            background: 'radial-gradient(circle, rgba(20, 40, 100, 0.35) 0%, rgba(25, 50, 130, 0.25) 30%, rgba(30, 60, 160, 0.15) 55%, transparent 75%)',
            filter: 'blur(120px)',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
          }}
          initial={{ scale: 1 }}
          animate={shouldAnimate
            ? {
                scale: [1, 1.06, 1],
              }
            : {}}
          transition={{
            duration: duration * 2.5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 0.2,
          }}
        />

        <motion.div
          className="absolute inset-0 rounded-full will-change-transform"
          style={{
            background: 'radial-gradient(circle, rgba(25, 50, 130, 0.28) 0%, rgba(30, 60, 160, 0.18) 35%, rgba(40, 80, 180, 0.10) 65%, transparent 85%)',
            filter: 'blur(160px)',
            transform: 'translateZ(0) scale(1.4)',
            backfaceVisibility: 'hidden',
          }}
          initial={{ scale: 1 }}
          animate={shouldAnimate
            ? {
                scale: [1, 1.08, 1],
              }
            : {}}
          transition={{
            duration: duration * 3,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 0.4,
          }}
        />
      </motion.div>
    </div>
  );
};
