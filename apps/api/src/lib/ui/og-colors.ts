/**
 * OpenGraph Image Colors
 *
 * Color constants for OG image generation.
 * Extracted to avoid triggering og-assets.generated.ts import at module level.
 */

import type { ChatMode } from '@roundtable/shared/enums';

import { BRAND } from '@/constants';

// ============================================================================
// OG IMAGE COLORS
// ============================================================================

export const OG_COLORS = {
  // Background
  background: '#000000',
  backgroundGradientStart: '#0a0a0a',
  backgroundGradientEnd: '#1a1a1a',

  // Brand colors
  primary: BRAND.colors.primary,
  secondary: BRAND.colors.secondary,

  // Text colors
  textPrimary: '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',

  // Glass-morphism
  glassBackground: 'rgba(24, 24, 27, 0.8)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  glassHighlight: 'rgba(255, 255, 255, 0.05)',

  // Mode-specific colors
  analyzing: '#8b5cf6',
  brainstorming: '#f59e0b',
  debating: '#ef4444',
  solving: '#10b981',

  // Status colors
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
} as const;

// ============================================================================
// MODE COLOR MAPPING
// ============================================================================

const MODE_COLORS = {
  analyzing: OG_COLORS.analyzing,
  brainstorming: OG_COLORS.brainstorming,
  debating: OG_COLORS.debating,
  solving: OG_COLORS.solving,
} as const satisfies Record<ChatMode, string>;

export function getModeColor(mode: ChatMode): string {
  return MODE_COLORS[mode] ?? OG_COLORS.primary;
}

// ============================================================================
// STYLING UTILITIES
// ============================================================================

export function createGradient(
  angle: number = 135,
  start: string = OG_COLORS.backgroundGradientStart,
  end: string = OG_COLORS.backgroundGradientEnd,
): string {
  return `linear-gradient(${angle}deg, ${start} 0%, ${end} 100%)`;
}

// ============================================================================
// TEXT UTILITIES
// ============================================================================

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}
