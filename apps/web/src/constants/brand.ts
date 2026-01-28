/**
 * Brand Constants - Web Package
 *
 * Extends shared brand constants with web-specific optimizations.
 * WebP format logos for modern browsers.
 */

import { API_BRAND as SharedApiBrand, BRAND as SharedBrand, getCopyrightText } from '@roundtable/shared';

// Re-export getCopyrightText unchanged
export { getCopyrightText };

// ============================================================================
// CORE BRAND IDENTITY - Web optimized
// ============================================================================

export const BRAND = {
  ...SharedBrand,
  // WebP format (10KB) for modern browsers, PNG fallback (77KB optimized)
  logos: {
    animation: '/static/logo.webp',
    dark: '/static/logo.webp',
    // Fallback options
    fallbackPng: '/static/logo-optimized.png',
    iconDark: '/static/logo.webp',
    iconLight: '/static/logo.webp',
    light: '/static/logo.webp',
    main: '/static/logo.webp',
    mainBlack: '/static/logo.webp',
    originalSvg: '/static/logo.svg',
    round: '/static/logo.webp',
    roundBlack: '/apple-touch-icon.png',
    roundWhite: '/static/logo.webp',
  } as const,
  // System fonts - same approach as ChatGPT
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif',
    weights: SharedBrand.typography.weights,
  } as const,
} as const;

// Re-export API_BRAND unchanged
export const API_BRAND = SharedApiBrand;
