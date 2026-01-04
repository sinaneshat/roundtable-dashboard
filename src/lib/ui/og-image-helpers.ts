/**
 * OpenGraph Image Helpers
 *
 * Utilities for generating dynamic OG images with proper type safety.
 * Uses brand constants and type-safe mode color mapping.
 */

import type { ChatMode } from '@/api/core/enums';
import { BRAND } from '@/constants/brand';
import { getAppBaseUrl } from '@/lib/config/base-urls';
import { getModelIconInfo } from '@/lib/utils';

// ============================================================================
// FONT LOADING FOR OG IMAGES
// ============================================================================

export type OGFontConfig = {
  name: string;
  data: ArrayBuffer;
  style: 'normal' | 'italic';
  weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
};

// Geist font TTF URLs from jsDelivr CDN (Satori requires TTF/OTF, not WOFF2)
const GEIST_REGULAR_URL = 'https://cdn.jsdelivr.net/npm/geist@1.5.1/dist/fonts/geist-sans/Geist-Regular.ttf';
const GEIST_SEMIBOLD_URL = 'https://cdn.jsdelivr.net/npm/geist@1.5.1/dist/fonts/geist-sans/Geist-SemiBold.ttf';
const GEIST_BOLD_URL = 'https://cdn.jsdelivr.net/npm/geist@1.5.1/dist/fonts/geist-sans/Geist-Bold.ttf';
const GEIST_BLACK_URL = 'https://cdn.jsdelivr.net/npm/geist@1.5.1/dist/fonts/geist-sans/Geist-Black.ttf';

/**
 * Fetches fonts for OG image generation.
 * Uses Geist TTF fonts from jsDelivr CDN (matches app's main font).
 * Satori only supports TTF/OTF formats, not WOFF2.
 */
export async function getOGFonts(): Promise<OGFontConfig[]> {
  const [regular, semibold, bold, black] = await Promise.all([
    fetch(GEIST_REGULAR_URL).then(res => res.arrayBuffer()),
    fetch(GEIST_SEMIBOLD_URL).then(res => res.arrayBuffer()),
    fetch(GEIST_BOLD_URL).then(res => res.arrayBuffer()),
    fetch(GEIST_BLACK_URL).then(res => res.arrayBuffer()),
  ]);

  return [
    { name: 'Geist', data: regular, style: 'normal', weight: 400 },
    { name: 'Geist', data: semibold, style: 'normal', weight: 600 },
    { name: 'Geist', data: bold, style: 'normal', weight: 700 },
    { name: 'Geist', data: black, style: 'normal', weight: 800 },
  ];
}

// ============================================================================
// IMAGE CONVERSION
// ============================================================================

export async function getBase64Image(relativePath: string): Promise<string> {
  const cleanPath = relativePath.replace(/^public\//, '');
  const baseUrl = getAppBaseUrl();
  const imageUrl = `${baseUrl}/${cleanPath}`;

  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }

  // Chunk-based conversion to avoid stack overflow with large images
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 8192;

  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    binary += String.fromCharCode(...chunk);
  }

  const base64 = btoa(binary);
  const ext = cleanPath.split('.').pop()?.toLowerCase();
  const mimeType = ext === 'png'
    ? 'image/png'
    : ext === 'jpg' || ext === 'jpeg'
      ? 'image/jpeg'
      : ext === 'svg'
        ? 'image/svg+xml'
        : 'image/png';

  return `data:${mimeType};base64,${base64}`;
}

export async function getModelIconBase64(modelId: string): Promise<string> {
  try {
    const { icon } = getModelIconInfo(modelId);
    const iconPath = icon.startsWith('/') ? `public${icon}` : `public/${icon}`;
    return await getBase64Image(iconPath);
  } catch {
    try {
      return await getBase64Image('public/static/icons/ai-models/openrouter.png');
    } catch {
      return '';
    }
  }
}

export async function getLogoBase64(): Promise<string> {
  return getBase64Image('public/static/logo.png');
}

export async function getModeIconBase64(mode: string): Promise<string> {
  try {
    return await getBase64Image(`public/static/icons/modes/${mode}.svg`);
  } catch {
    return getBase64Image('public/static/icons/modes/analyzing.svg');
  }
}

export async function getUIIconBase64(iconName: string): Promise<string> {
  return getBase64Image(`public/static/icons/ui/${iconName}.svg`);
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
