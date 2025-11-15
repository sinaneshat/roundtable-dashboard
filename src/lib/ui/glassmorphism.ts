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
 * Liquid Glass card styles - Pure background blur (no color distortion)
 * Applied via inline styles to blur BACKGROUND content only (not the card itself)
 *
 * NOTE: CSS backdrop-filter does not support geometric distortion (warping/displacement).
 * Only blur is available without color manipulation (no hue, saturation changes).
 * Progressive blur levels create depth without altering background colors.
 *
 * Distortion levels (pure blur only):
 * - Subtle: 20px blur (light frosting)
 * - Medium: 30px blur (standard modal glass) - DEFAULT
 * - Strong: 40px blur (heavy frosting)
 */
export const glassCardStyles = {
  subtle: {
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  },
  medium: {
    backdropFilter: 'blur(30px)',
    WebkitBackdropFilter: 'blur(30px)',
  },
  strong: {
    backdropFilter: 'blur(40px)',
    WebkitBackdropFilter: 'blur(40px)',
  },
} as const;

/**
 * Chat input blur - Strong glass effect matching chat input box
 * Use for sticky headers and prominent UI elements
 *
 * Strong blur (no color distortion):
 * - blur(24px): Tailwind backdrop-blur-xl equivalent
 * - Same blur as chat input for consistency
 * - Makes content unreadable while maintaining glass aesthetic
 */
export const chatInputBlurStyles = {
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
} as const;

/**
 * Heavy glass card styles for sticky headers (scrolling content)
 * Use ONLY where content scrolls past - extreme blur makes text unreadable
 *
 * Maximum blur (no color distortion):
 * - blur(60px): Extreme blur obliterates text behind sticky headers
 * - Pure blur effect preserves colors, only destroys readability
 */
export const heavyGlassCardStyles = {
  backdropFilter: 'blur(60px)',
  WebkitBackdropFilter: 'blur(60px)',
} as const;

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
 * Liquid Glass overlay styles - Pure background blur (no color distortion)
 * Applied via inline styles to blur background content only
 *
 * NOTE: CSS backdrop-filter does not support geometric distortion (warping).
 * Only blur is available without color manipulation.
 * Heavy blur creates the illusion of textured glass distortion.
 */
export const glassOverlayStyles = {
  backdropFilter: 'blur(25px)',
  WebkitBackdropFilter: 'blur(25px)',
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
