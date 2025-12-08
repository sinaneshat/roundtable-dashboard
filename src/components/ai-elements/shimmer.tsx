'use client';

import { motion } from 'motion/react';
import { memo } from 'react';

import { cn } from '@/lib/ui/cn';

export type TextShimmerProps = {
  children: string;
  className?: string;
};

function TextShimmerComponent({
  children,
  className,
}: TextShimmerProps) {
  return (
    <div className={cn('font-sans font-bold [--shadow-color:var(--color-neutral-500)] dark:[--shadow-color:var(--color-neutral-100)]', className)}>
      {children.split('').map((char, i) => (
        <motion.span
          // Index required for unique keys when characters repeat (e.g., "hello" has duplicate 'l')
          // eslint-disable-next-line react/no-array-index-key
          key={`shimmer-char-${i}`}
          className="inline-block"
          initial={{ scale: 1, opacity: 0.5 }}
          animate={{
            scale: [1, 1.1, 1],
            textShadow: [
              '0 0 0 var(--shadow-color)',
              '0 0 1px var(--shadow-color)',
              '0 0 0 var(--shadow-color)',
            ],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            repeatType: 'loop',
            delay: i * 0.05,
            ease: 'easeInOut',
            repeatDelay: 2,
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
    </div>
  );
}

export const TextShimmer = memo(TextShimmerComponent);
