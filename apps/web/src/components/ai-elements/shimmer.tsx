import { motion } from 'motion/react';
import { memo } from 'react';

type TextShimmerProps = {
  children: string;
  className?: string;
};

const SHIMMER_ANIMATION = {
  DELAY_PER_CHAR: 0.05,
  DURATION: 0.5,
  INITIAL_OPACITY: 0.5,
  NON_BREAKING_SPACE: '\u00A0',
  OPACITY_SEQUENCE: [0.5, 1, 0.5] as const,
  PEAK_OPACITY: 1,
  REPEAT_DELAY: 2,
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
            delay: i * SHIMMER_ANIMATION.DELAY_PER_CHAR,
            duration: SHIMMER_ANIMATION.DURATION,
            ease: 'easeInOut',
            repeat: Infinity,
            repeatDelay: SHIMMER_ANIMATION.REPEAT_DELAY,
            repeatType: 'loop',
          }}
        >
          {char === ' ' ? SHIMMER_ANIMATION.NON_BREAKING_SPACE : char}
        </motion.span>
      ))}
    </div>
  );
}

export const TextShimmer = memo(TextShimmerComponent);
