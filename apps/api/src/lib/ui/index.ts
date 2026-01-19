/**
 * UI Utilities Barrel Export
 *
 * **SINGLE SOURCE OF TRUTH**: All UI/styling utilities from @/lib/ui
 *
 * @module lib/ui
 */

export * from './browser-timing';
export { cn } from './cn';
// NOTE: og-assets.generated.ts NOT exported here - 460KB of Base64 assets, server-only
// Import directly in OG image routes: import { getOGFontsSync } from '@/lib/ui/og-assets.generated'
