/**
 * UI Utilities Barrel Export
 *
 * **SINGLE SOURCE OF TRUTH**: All UI/styling utilities from @/lib/ui
 *
 * @module lib/ui
 */

export * from './browser-timing';
export { cn } from './cn';
export * from './color-extraction';
export * from './fonts';
export * from './glassmorphism';
// NOTE: og-image-helpers.ts NOT exported here - 460KB of Base64 assets
// Import directly in server-only OG image routes: import { ... } from '@/lib/ui/og-image-helpers'
// NOTE: og-fonts.server.ts NOT exported here - uses Node.js fs, server-only
