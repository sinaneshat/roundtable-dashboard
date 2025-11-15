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
 * Enhanced glass card styles with color distortion
 * Applied via inline styles for premium frosted glass effect with saturation
 */
export const glassCardStyles = {
  subtle: {
    backdropFilter: 'blur(12px) saturate(140%)',
    WebkitBackdropFilter: 'blur(12px) saturate(140%)',
  },
  medium: {
    backdropFilter: 'blur(24px) saturate(150%)',
    WebkitBackdropFilter: 'blur(24px) saturate(150%)',
  },
  strong: {
    backdropFilter: 'blur(40px) saturate(160%)',
    WebkitBackdropFilter: 'blur(40px) saturate(160%)',
  },
} as const;

/**
 * Glass overlay for dialogs and modals
 * Enhanced backdrop blur with color saturation for premium frosted glass effect
 */
export const glassOverlay = cn(
  'backdrop-blur-xl',
  'bg-black/40',
);

/**
 * Enhanced glass overlay styles with color distortion
 * Applied via inline styles for maximum effect
 */
export const glassOverlayStyles = {
  backdropFilter: 'blur(24px) saturate(150%)',
  WebkitBackdropFilter: 'blur(24px) saturate(150%)',
} as const;

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

  // Chat input box - Liquid Glass effect (fully transparent with blur)
  inputBox: cn(
    'backdrop-blur-2xl',
    'border border-white/10',
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
    'border border-white/10',
  ),
} as const;
