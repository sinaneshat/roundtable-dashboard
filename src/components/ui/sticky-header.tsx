/**
 * Reusable Sticky Header Component
 *
 * Provides consistent sticky header behavior with animations across the app.
 * Used in chat lists, timelines, and any scrollable sections that need sticky headers.
 *
 * Features:
 * - Smooth fade-in animation on mount
 * - Configurable z-index for proper layering
 * - Automatic glassmorphism styling
 * - Type-safe and composable
 */

'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';

import { cn, getZIndexClass } from '@/lib/ui/cn';

type StickyHeaderProps = {
  children: ReactNode;
  /** Z-index value for layering (10-50, defaults to 10) */
  zIndex?: number;
  /** Additional Tailwind classes */
  className?: string;
  /** Disable glassmorphism background (defaults to false) */
  noBackground?: boolean;
};

/**
 * Sticky header with smooth animation and consistent styling
 *
 * @example
 * <StickyHeader zIndex={20}>
 *   <h2>Section Title</h2>
 * </StickyHeader>
 *
 * @example With custom background
 * <StickyHeader noBackground className="bg-primary/10">
 *   <div>Custom styled header</div>
 * </StickyHeader>
 */
export function StickyHeader({
  children,
  zIndex = 10,
  className,
  noBackground = false,
}: StickyHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 500,
        damping: 40,
      }}
      className={cn(
        'sticky top-0',
        getZIndexClass(zIndex),
        !noBackground && 'backdrop-blur-[40px] backdrop-saturate-[200%] bg-black',
        className,
      )}
    >
      {children}
    </motion.div>
  );
}
