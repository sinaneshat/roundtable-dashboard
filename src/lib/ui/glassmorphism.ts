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
 * Glass effect variants
 * - subtle: Light glass effect for backgrounds
 * - medium: Standard glass effect for cards and panels
 * - strong: Heavy glass effect for prominent overlays
 */
export const glassVariants = {
  // Subtle glass - minimal blur, very transparent
  subtle: cn(
    'backdrop-blur-md',
    'bg-background/5',
    'border-white/10',
    'shadow-md',
  ),

  // Medium glass - standard blur, semi-transparent (default for cards)
  medium: cn(
    'backdrop-blur-xl',
    'bg-background/10',
    'border-white/20',
    'shadow-2xl',
  ),

  // Strong glass - heavy blur, more opaque
  strong: cn(
    'backdrop-blur-2xl',
    'bg-background/20',
    'border-white/30',
    'shadow-3xl',
  ),
} as const;

/**
 * Glass hover states
 */
export const glassHoverVariants = {
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
 * Subtle backdrop blur following shadcn patterns (minimal blur, reduced opacity)
 */
export const glassOverlay = cn(
  'backdrop-blur-sm',
  'bg-black/30',
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
// Utility Functions
// ============================================================================

/**
 * Create custom glass effect with specific opacity
 * @param params - Glass effect configuration
 * @param params.blurAmount - Tailwind blur class (e.g., 'md', 'xl', '2xl')
 * @param params.bgOpacity - Background opacity (0-100)
 * @param params.borderOpacity - Border opacity (0-100)
 * @param params.shadow - Tailwind shadow class
 */
export function createGlassEffect({
  blurAmount = 'xl',
  bgOpacity = 10,
  borderOpacity = 20,
  shadow = '2xl',
}: {
  blurAmount?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  bgOpacity?: number;
  borderOpacity?: number;
  shadow?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
} = {}): string {
  return cn(
    `backdrop-blur-${blurAmount}`,
    `bg-background/${bgOpacity}`,
    `border-white/${borderOpacity}`,
    `shadow-${shadow}`,
  );
}

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

  // Chat input box
  inputBox: cn(
    'backdrop-blur-xl',
    'bg-background/10',
    'border border-white/30',
    'shadow-2xl',
    'hover:border-white/40',
    'focus-within:bg-background/20',
    'focus-within:border-white/40',
    'focus-within:ring-2 focus-within:ring-white/20',
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

  // Navigation sidebars - solid background matching Shadcn's design
  sidebar: cn(
    'bg-sidebar',
    'border-r border-sidebar-border',
  ),
} as const;
