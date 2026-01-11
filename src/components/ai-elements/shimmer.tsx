'use client';

import { motion } from 'motion/react';
import { memo } from 'react';

type TextShimmerProps = {
  children: string;
  className?: string;
};

const SHIMMER_ANIMATION = {
  INITIAL_OPACITY: 0.5,
  PEAK_OPACITY: 1,
  OPACITY_SEQUENCE: [0.5, 1, 0.5] as const,
  DURATION: 0.5,
  DELAY_PER_CHAR: 0.05,
  REPEAT_DELAY: 2,
  NON_BREAKING_SPACE: '\u00A0',
} as const;

function TextShimmerComponent({
  children,
  className,
}: TextShimmerProps) {
  return (
    <div className={className}>
      {children.split('').map((char, i) => (
        <motion.span
          // eslint-disable-next-line react/no-array-index-key
          key={`shimmer-char-${i}`}
          className="inline-block"
          initial={{ opacity: SHIMMER_ANIMATION.INITIAL_OPACITY }}
          animate={{
            opacity: [...SHIMMER_ANIMATION.OPACITY_SEQUENCE],
          }}
          transition={{
            duration: SHIMMER_ANIMATION.DURATION,
            repeat: Infinity,
            repeatType: 'loop',
            delay: i * SHIMMER_ANIMATION.DELAY_PER_CHAR,
            ease: 'easeInOut',
            repeatDelay: SHIMMER_ANIMATION.REPEAT_DELAY,
          }}
        >
          {char === ' ' ? SHIMMER_ANIMATION.NON_BREAKING_SPACE : char}
        </motion.span>
      ))}
    </div>
  );
}

export const TextShimmer = memo(TextShimmerComponent);
