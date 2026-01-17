/**
 * Glassmorphism Design System
 *
 * Centralized glassmorphism utilities for consistent glass-like effects
 * Used across cards, dialogs, popovers, and other overlay components
 *
 * Design tokens extracted from chat components (ChatQuickStart, ChatInput)
 */

import { cn } from './cn';

// ============================================================================
// Core Glassmorphism Classes
// ============================================================================

/**
 * Liquid Glass effect variants (Official Liquid Glass Generator specification)
 * Based on https://liquidglassgen.com/ official presets:
 * - subtle: Light Glass (90% opacity, 15px blur, 5% tint)
 * - medium: Medium Glass (85% opacity, 20px blur, 8% tint) - Default for modals
 * - strong: Heavy Glass (75% opacity, 30px blur, 15% tint)
 *
 * NOTE: Tailwind blur classes are approximations. Exact blur values are enforced via inline styles.
 * Tailwind mapping: backdrop-blur-lg=16px, backdrop-blur-xl=24px, backdrop-blur-2xl=40px
 */
export const glassVariants = {
  // Light Glass - subtle frosting, high transparency (15px blur via inline styles)
  subtle: cn(
    'backdrop-blur-lg', // Tailwind: 16px (closest to 15px target)
    'bg-background/10', // 10% background + 5% tint layer = 15% total
    'border-white/20',
    'shadow-md',
  ),

  // Medium Glass - standard modal glass effect (20px blur via inline styles) - DEFAULT
  medium: cn(
    'backdrop-blur-xl', // Tailwind: 24px (will be overridden by inline 20px)
    'bg-background/15', // 15% background + 8% tint layer = 23% total ≈ 85% transparency
    'border-white/20',
    'shadow-lg',
  ),

  // Heavy Glass - prominent overlays (30px blur via inline styles)
  strong: cn(
    'backdrop-blur-2xl', // Tailwind: 40px (will be overridden by inline 30px)
    'bg-background/25', // 25% background = 75% transparency
    'border-white/30',
    'shadow-xl',
  ),
} as const;

/**
 * Glass hover states (internal use by glassCard())
 */
const glassHoverVariants = {
  subtle: cn(
    'hover:bg-background/10',
    'hover:border-white/15',
    'transition-all duration-200',
  ),

  medium: cn(
    'hover:bg-background/20',
    'hover:border-white/30',
    'transition-all duration-200',
  ),

  strong: cn(
    'hover:bg-background/30',
    'hover:border-white/40',
    'transition-all duration-200',
  ),
} as const;

// ============================================================================
// Composite Glass Classes
// ============================================================================

/**
 * Complete glass card styling with hover effects
 * @param variant - Glass effect strength
 * @returns Combined className string
 */
export function glassCard(variant: keyof typeof glassVariants = 'medium'): string {
  return cn(
    glassVariants[variant],
    glassHoverVariants[variant],
  );
}

/**
 * Glass overlay for dialogs and modals
 * Following Official Liquid Glass Generator specification
 * Uses "Light Glass" preset (90% transparency, 15px blur, 5% tint)
 * https://liquidglassgen.com/
 *
 * NOTE: Tailwind backdrop-blur-lg = 16px, closest to target 15px.
 * Exact 15px blur enforced via inline glassOverlayStyles.
 */
export const glassOverlay = cn(
  'backdrop-blur-lg', // Tailwind: 16px (closest to 15px target, overridden by inline styles)
  'bg-black/30', // 30% opacity backdrop
);

/**
 * Glass input/form styling
 * Optimized for text input visibility
 */
export const glassInput = cn(
  'backdrop-blur-xl',
  'bg-background/10',
  'border-white/20',
  'shadow-2xl',
  'focus-visible:bg-background/20',
  'focus-visible:border-white/30',
  'transition-all duration-200',
);

/**
 * Glass badge/chip styling
 * For small elements like tags, participants, etc.
 */
export const glassBadge = cn(
  'backdrop-blur-md',
  'bg-white/10',
  'border border-white/30',
  'shadow-md',
);

// ============================================================================
// Component-Specific Presets
// ============================================================================

/**
 * Chat-specific glass effects
 * Used in chat cards, input boxes, and overlays
 */
export const chatGlass = {
  // Quick start suggestion cards
  quickStartCard: cn(
    glassVariants.medium,
    glassHoverVariants.medium,
    'hover:shadow-3xl', // Extra shadow on hover
  ),

  // Chat input box - Liquid Glass effect (fully transparent with blur)
  inputBox: cn(
    'backdrop-blur-2xl',
    'border border-white/[0.12]',
    'hover:border-white/20',
    'focus-within:border-white/20',
    'transition-all duration-200',
  ),

  // Participant/model badges
  participantBadge: cn(
    glassBadge,
    'rounded-full',
  ),

  // Message bubbles (for future use)
  messageBubble: cn(
    glassVariants.subtle,
    'rounded-2xl',
  ),
} as const;

/**
 * Dashboard-specific glass effects
 * For cards, panels, and data displays
 */
export const dashboardGlass = {
  // Stats cards
  statsCard: cn(
    glassVariants.medium,
    glassHoverVariants.medium,
  ),

  // Data table headers/panels
  tablePanel: cn(
    glassVariants.subtle,
    'border-b',
  ),

  // Navigation sidebars - glassmorphism design matching chat input
  sidebar: cn(
    'backdrop-blur-xl',
    'bg-white/5',
    'border border-white/[0.12]',
  ),
} as const;
