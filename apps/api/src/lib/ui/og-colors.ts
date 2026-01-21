/**
 * OpenGraph Image Colors & Constants
 *
 * Single source of truth for OG image generation configuration.
 * Extracted to avoid triggering og-assets.generated.ts import at module level.
 */

import type { ChatMode } from '@roundtable/shared/enums';
import { CHAT_MODES, ChatModeSchema } from '@roundtable/shared/enums';
import * as z from 'zod';

import { BRAND } from '@/constants';

// ============================================================================
// OG IMAGE DIMENSIONS (Standard)
// ============================================================================

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const MAX_MODEL_ICONS = 5;

// ============================================================================
// OG IMAGE DEFAULTS SCHEMA (Zod-first pattern)
// ============================================================================

export const OgDefaultsSchema = z.object({
  title: z.string(),
  participantCount: z.number().int().nonnegative(),
  messageCount: z.number().int().nonnegative(),
});

export type OgDefaults = z.infer<typeof OgDefaultsSchema>;

export const OG_DEFAULTS: OgDefaults = {
  title: 'AI Conversation',
  participantCount: 3,
  messageCount: 10,
};

// ============================================================================
// OG IMAGE PARAMS SCHEMA (Zod-first validation)
// ============================================================================

export const OgImageParamsSchema = z.object({
  title: z.string(),
  mode: ChatModeSchema.optional(),
  participantCount: z.number().int().nonnegative(),
  messageCount: z.number().int().nonnegative(),
  participantModelIds: z.array(z.string()),
});

export type OgImageParams = z.infer<typeof OgImageParamsSchema>;

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
// MODE COLOR MAPPING (enum-based pattern using CHAT_MODES array)
// ============================================================================

/**
 * Mode colors derived from OG_COLORS using CHAT_MODES array as single source of truth
 */
export const MODE_COLORS = CHAT_MODES.reduce(
  (acc, mode) => {
    acc[mode] = OG_COLORS[mode];
    return acc;
  },
  {} as Record<ChatMode, string>,
);

/**
 * Get color for a chat mode with fallback to primary
 * Uses Zod validation internally for type safety
 */
export function getModeColor(mode: ChatMode): string {
  const parsed = ChatModeSchema.safeParse(mode);
  if (parsed.success) {
    return MODE_COLORS[parsed.data];
  }
  return OG_COLORS.primary;
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

/**
 * Max characters for OG title - calculated for 1080px usable width (1200px - 120px padding)
 * At 52px font, ~30 chars per line. 50 chars more conservative for 2 lines with lineClamp.
 */
export const OG_TITLE_MAX_CHARS = 50;

/**
 * Truncate title for OG images with word-boundary awareness
 * - Avoids cutting words in the middle
 * - Uses proper ellipsis character
 * - Falls back to hard truncate for single very long words
 * - Default 55 chars fits ~2 lines at 56px font in 1200x630 OG image
 */
export function truncateTitle(title: string, maxLength: number = OG_TITLE_MAX_CHARS): string {
  const trimmed = title.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  // Find last space before maxLength
  const truncated = trimmed.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  // If no space found or space is too early, hard truncate
  if (lastSpace === -1 || lastSpace < maxLength * 0.5) {
    return `${truncated.trimEnd()}…`;
  }

  return `${truncated.slice(0, lastSpace).trimEnd()}…`;
}
