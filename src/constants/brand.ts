/**
 * Brand Constants
 *
 * Centralized brand identity, colors, logos, and messaging.
 * All constants immutable with 'as const' assertion.
 */

// ============================================================================
// CORE BRAND IDENTITY
// ============================================================================

export const BRAND = {
  name: 'Roundtable',
  fullName: 'Roundtable Dashboard',
  displayName: 'Roundtable.now',
  domain: 'roundtable.now',
  domainDisplay: 'Roundtable.now',
  tagline: 'Watch multiple models debate and brainstorm together',
  description: 'Watch multiple models debate and brainstorm together',
  venture: 'Roundtable',

  // URLs
  website: 'https://roundtable.now/',
  parentWebsite: 'https://roundtable.now/',
  support: 'hello@roundtable.now',

  // Professional AI/tech brand colors
  colors: {
    primary: '#2563eb',
    secondary: '#64748b',
    dark: '#0f172a',
    light: '#f8fafc',
    accent: '#3b82f6',
    background: '#ffffff',
    foreground: '#1e293b',
  } as const,

  // Rainbow gradient colors extracted from logo
  logoGradient: [
    '#FFD700', // Vibrant Gold/Yellow
    '#FF8C00', // Deep Orange
    '#FF1493', // Deep Pink/Magenta
    '#9C27B0', // Purple
    '#673AB7', // Deep Purple
    '#3F51B5', // Indigo
    '#2196F3', // Blue
    '#00BCD4', // Cyan
    '#00897B', // Teal
    '#4CAF50', // Green
    '#8BC34A', // Light Green
    '#CDDC39', // Lime
  ] as const,

  // Holographic sphere logo paths
  logos: {
    light: '/static/logo.svg',
    dark: '/static/logo.svg',
    iconLight: '/static/logo.svg',
    iconDark: '/static/logo.svg',
    round: '/static/logo.svg',
    roundWhite: '/static/logo.svg',
    roundBlack: '/apple-touch-icon.png',
    animation: '/static/logo.svg',
    main: '/static/logo.svg',
    mainBlack: '/static/logo.svg',
  } as const,

  // Modern tech fonts
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    weights: {
      light: 300,
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    } as const,
  } as const,

  // Social links
  social: {
    twitter: 'https://twitter.com/roundtablenow',
    linkedin: 'https://linkedin.com/company/roundtable',
    github: 'https://github.com/roundtable',
  } as const,

  // Legal
  legal: {
    terms: '/terms',
    privacy: '/privacy',
  } as const,
} as const;

// Static copyright year - update annually
const COPYRIGHT_YEAR = 2025;

export function getCopyrightText(): string {
  return `© ${COPYRIGHT_YEAR} ${BRAND.name}. All rights reserved.`;
}

// ============================================================================
// API-SPECIFIC BRANDING
// ============================================================================

export const API_BRAND = {
  apiName: `${BRAND.name} API`,
  apiDescription: `${BRAND.description} - Application API`,
  apiVersion: '1.0.0',
  supportEmail: BRAND.support,
  docsUrl: `${BRAND.website}docs`,

  rateLimitInfo: {
    name: BRAND.name,
    website: BRAND.website,
  } as const,

  errorBranding: {
    company: BRAND.name,
    support: BRAND.support,
    website: BRAND.website,
  } as const,

  // Roundtable-specific messaging
  messaging: {
    rateLimitMessage: 'Processing capacity exceeded. Multiple models need time to think.',
    unauthorizedMessage: 'Access denied. Please join the roundtable with proper credentials.',
    serverErrorMessage: 'System processing error. The AI collaboration network is experiencing issues.',
  } as const,
} as const;
