/**
 * UI Utilities Barrel Export
 *
 * **SINGLE SOURCE OF TRUTH**: All UI/styling utilities from @/lib/ui
 *
 * Includes:
 * - Styling utilities (cn, flex, grid patterns)
 * - Glassmorphism effects
 * - Browser timing coordination
 * - Color extraction from images
 * - OG image generation
 *
 * @module lib/ui
 */

// ============================================================================
// Browser & Rendering
// ============================================================================
export * from './browser-timing';
// ============================================================================
// Styling Utilities
// ============================================================================
export { cn, flex, flexPatterns, getZIndexClass, grid, gridPatterns } from './cn';

// ============================================================================
// Image & Color
// ============================================================================
export * from './color-extraction';
export * from './glassmorphism';
export * from './og-image-helpers';
