'use client';

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

/**
 * AnalysisSection Component
 *
 * Reusable section wrapper with consistent framer-motion animations.
 * Provides fadeInUp animation with optional children stagger support.
 *
 * Animation Pattern:
 * - NO scale animations (per user requirement)
 * - Only opacity and y-axis transforms
 * - Consistent easing: [0.4, 0, 0.2, 1]
 * - Stagger children with 0.05s delay
 *
 * @example
 * ```tsx
 * <AnalysisSection
 *   title="Key Insights"
 *   icon={Lightbulb}
 * >
 *   <ul>{insights.map(...)}</ul>
 * </AnalysisSection>
 * ```
 */

// Animation constants - NO scale animations allowed
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] as const },
};

const staggerChildren = {
  animate: { transition: { staggerChildren: 0.05 } },
};

export type AnalysisSectionProps = {
  /** Section title */
  title: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Section content */
  children: ReactNode;
  /** Enable stagger animation for children */
  enableStagger?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Additional classes for title */
  titleClassName?: string;
};

export function AnalysisSection({
  title,
  icon: Icon,
  children,
  enableStagger = false,
  className,
  titleClassName,
}: AnalysisSectionProps) {
  return (
    <motion.div {...fadeInUp} className={cn('space-y-2.5', className)}>
      <h3 className={cn('flex items-center gap-2 text-sm font-semibold', titleClassName)}>
        <Icon className="size-4" />
        {title}
      </h3>
      {enableStagger
        ? (
            <motion.div
              variants={staggerChildren}
              initial="initial"
              animate="animate"
            >
              {children}
            </motion.div>
          )
        : (
            children
          )}
    </motion.div>
  );
}

/**
 * Export animation constants for external use
 * Use these in other components for consistent animations
 */
// eslint-disable-next-line react-refresh/only-export-components
export const animationVariants = {
  fadeInUp,
  staggerChildren,

  // Item animation for staggered children
  itemFade: {
    initial: { opacity: 0, x: -10 },
    animate: { opacity: 1, x: 0, transition: { duration: 0.3 } },
  },

  // Action item animation (for buttons/interactive elements)
  actionFade: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
  },
} as const;
