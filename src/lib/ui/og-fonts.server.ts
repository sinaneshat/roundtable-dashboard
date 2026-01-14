/**
 * OG Image Font Loader (Edge-compatible)
 *
 * Uses pre-generated base64-encoded fonts for instant loading.
 * No network calls required - fonts embedded at build time.
 *
 * Regenerate: npx tsx scripts/generate-og-assets.ts
 */

export type { OGFontConfig } from './og-assets.generated';
export { getOGFontsSync } from './og-assets.generated';
