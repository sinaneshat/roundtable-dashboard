/**
 * OpenGraph Image Helpers
 *
 * Utilities for generating dynamic OG images with proper type safety.
 * Uses brand constants and type-safe mode color mapping.
 *
 * NOTE: Common assets (logo, mode icons, provider icons) are embedded at build time.
 * See: scripts/generate-og-assets.ts
 */

import type { ChatMode } from '@roundtable/shared/enums';

import { BRAND } from '@/constants';
import { getAppBaseUrl } from '@/lib/config/base-urls';

import {
  getLogoBase64Sync,
  getModeIconBase64Sync,
  getModelIconBase64Sync,
  getUIIconBase64Sync,
} from './og-assets.generated';

// ============================================================================
// IMAGE HELPERS (use embedded assets when available, fallback to fetch)
// ============================================================================

/**
 * Get logo as base64 - uses embedded asset (instant, no network)
 */
export async function getLogoBase64(): Promise<string> {
  return getLogoBase64Sync();
}

/**
 * Get mode icon as base64 - uses embedded asset (instant, no network)
 */
export async function getModeIconBase64(mode: string): Promise<string> {
  return getModeIconBase64Sync(mode);
}

/**
 * Get UI icon as base64 - uses embedded asset (instant, no network)
 */
export async function getUIIconBase64(iconName: string): Promise<string> {
  return getUIIconBase64Sync(iconName);
}

/**
 * Get model provider icon as base64 - uses embedded asset for common providers
 * Falls back to fetch for uncommon models
 */
export async function getModelIconBase64(modelId: string): Promise<string> {
  // Try embedded asset first (covers common providers)
  const embedded = getModelIconBase64Sync(modelId);
  if (embedded)
    return embedded;

  // Fallback to fetch for uncommon models (with caching)
  return fetchImageBase64(`static/icons/ai-models/openrouter.png`);
}

// ============================================================================
// IMAGE CACHE (for fallback fetches only)
// ============================================================================

const imageCache = new Map<string, string>();

/**
 * Fetch image and convert to base64 (with caching)
 * Only used as fallback when embedded asset not available
 */
async function fetchImageBase64(relativePath: string): Promise<string> {
  const cached = imageCache.get(relativePath);
  if (cached)
    return cached;

  try {
    const baseUrl = getAppBaseUrl();
    const imageUrl = `${baseUrl}/${relativePath}`;
    const response = await fetch(imageUrl);

    if (!response.ok)
      return '';

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;

    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binary += String.fromCharCode(...chunk);
    }

    const ext = relativePath.split('.').pop()?.toLowerCase();
    const mimeType = ext === 'png'
      ? 'image/png'
      : ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'svg' ? 'image/svg+xml' : 'image/png';

    const result = `data:${mimeType};base64,${btoa(binary)}`;
    imageCache.set(relativePath, result);
    return result;
  } catch {
    return '';
  }
}

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
