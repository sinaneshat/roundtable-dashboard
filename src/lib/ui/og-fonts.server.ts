/**
 * OG Image Font Loader (Edge-compatible)
 *
 * Uses pre-generated base64-encoded fonts for instant loading.
 * No network calls required - fonts embedded at build time.
 *
 * Regenerate: npx tsx scripts/generate-og-assets.ts
 */

// Re-export from generated assets file
export type { OGFontConfig } from './og-assets.generated';
export { getOGFontsSync as getOGFonts } from './og-assets.generated';
