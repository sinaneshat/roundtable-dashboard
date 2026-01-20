/**
 * OpenGraph Image Helpers
 *
 * Utilities for generating dynamic OG images with proper type safety.
 * Uses brand constants and type-safe mode color mapping.
 *
 * NOTE: Common assets (logo, mode icons, provider icons) are embedded at build time.
 * See: scripts/generate-og-assets.ts
 *
 * IMPORTANT: OG_COLORS and utilities are in og-colors.ts to avoid importing
 * the 449KB og-assets.generated.ts at module level.
 */

import { getAppBaseUrl } from '@/lib/config/base-urls';

// Lazy load asset functions to avoid 449KB module at startup
type OGAssetsModule = typeof import('./og-assets.generated');
let ogAssetsModule: OGAssetsModule | null = null;

async function getOGAssets(): Promise<OGAssetsModule> {
  if (!ogAssetsModule) {
    ogAssetsModule = await import('./og-assets.generated');
  }
  return ogAssetsModule;
}

// ============================================================================
// IMAGE HELPERS (use lazy-loaded embedded assets)
// ============================================================================

/**
 * Get logo as base64 - uses embedded asset (lazy loaded)
 */
export async function getLogoBase64(): Promise<string> {
  const assets = await getOGAssets();
  return assets.getLogoBase64Sync();
}

/**
 * Get mode icon as base64 - uses embedded asset (lazy loaded)
 */
export async function getModeIconBase64(mode: string): Promise<string> {
  const assets = await getOGAssets();
  return assets.getModeIconBase64Sync(mode);
}

/**
 * Get UI icon as base64 - uses embedded asset (lazy loaded)
 */
export async function getUIIconBase64(iconName: string): Promise<string> {
  const assets = await getOGAssets();
  return assets.getUIIconBase64Sync(iconName);
}

/**
 * Get model provider icon as base64 - uses embedded asset for common providers
 * Falls back to fetch for uncommon models
 */
export async function getModelIconBase64(modelId: string): Promise<string> {
  const assets = await getOGAssets();
  // Try embedded asset first (covers common providers)
  const embedded = assets.getModelIconBase64Sync(modelId);
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
