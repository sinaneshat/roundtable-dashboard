'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

/**
 * AnalysisSection Component
 *
 * Reusable section wrapper for analysis content.
 * No animations - content renders immediately.
 */

export type AnalysisSectionProps = {
  /** Section title */
  title: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Section content */
  children: ReactNode;
  /** Enable stagger animation for children (ignored - kept for API compatibility) */
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
  className,
  titleClassName,
}: AnalysisSectionProps) {
  return (
    <div className={cn('space-y-2.5', className)}>
      <h3 className={cn('flex items-center gap-2 text-sm font-semibold', titleClassName)}>
        <Icon className="size-4" />
        {title}
      </h3>
      {children}
    </div>
  );
}

/**
 * Export empty animation constants for API compatibility
 */
// eslint-disable-next-line react-refresh/only-export-components
export const animationVariants = {
  fadeInUp: {},
  staggerChildren: {},
  itemFade: {},
  actionFade: {},
} as const;
