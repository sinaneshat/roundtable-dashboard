/**
 * Brand Constants
 *
 * Centralized brand identity, colors, logos, and messaging.
 * All constants immutable with 'as const' assertion.
 */

import { APP_VERSION } from './version';

// ============================================================================
// CORE BRAND IDENTITY
// ============================================================================

export const BRAND = {
  // Professional AI/tech brand colors
  colors: {
    accent: '#3b82f6',
    background: '#ffffff',
    dark: '#0f172a',
    foreground: '#1e293b',
    light: '#f8fafc',
    primary: '#2563eb',
    secondary: '#64748b',
  } as const,
  description: 'Chat with ChatGPT, Claude, Gemini and more AI models at once. Get diverse perspectives, brainstorm ideas, and solve problems with multiple AIs collaborating in real-time.',
  displayName: 'Roundtable.now',
  domain: 'roundtable.now',
  domainDisplay: 'Roundtable.now',
  fullName: 'Roundtable',
  // Legal
  legal: {
    privacy: '/privacy',
    terms: '/terms',
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
    animation: '/static/logo.svg',
    dark: '/static/logo.svg',
    iconDark: '/static/logo.svg',
    iconLight: '/static/logo.svg',
    light: '/static/logo.svg',
    main: '/static/logo.svg',
    mainBlack: '/static/logo.svg',
    round: '/static/logo.svg',
    roundBlack: '/apple-touch-icon.png',
    roundWhite: '/static/logo.svg',
  } as const,
  name: 'Roundtable',
  parentWebsite: 'https://roundtable.now/',

  // Social links
  social: {
    github: 'https://github.com/roundtable',
    linkedin: 'https://linkedin.com/company/roundtable',
    twitter: 'https://twitter.com/roundtablenow',
    twitterHandle: '@roundtablenow',
  } as const,

  support: 'soheil@deadpixel.ai',

  tagline: 'Multiple AI Models, One Conversation',

  // Modern tech fonts
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    weights: {
      bold: 700,
      light: 300,
      medium: 500,
      regular: 400,
      semibold: 600,
    } as const,
  } as const,

  venture: 'Roundtable',

  // URLs
  website: 'https://roundtable.now/',
} as const;

const COPYRIGHT_YEAR = 2025;

export function getCopyrightText(): string {
  return `© ${COPYRIGHT_YEAR} ${BRAND.name}. All rights reserved.`;
}

// ============================================================================
// API-SPECIFIC BRANDING
// ============================================================================

export const API_BRAND = {
  apiDescription: `${BRAND.description} - Application API`,
  apiName: `${BRAND.name} API`,
  apiVersion: APP_VERSION,
  docsUrl: `${BRAND.website}docs`,
  errorBranding: {
    company: BRAND.name,
    support: BRAND.support,
    website: BRAND.website,
  } as const,

  // Roundtable-specific messaging
  messaging: {
    rateLimitMessage: 'Processing capacity exceeded. Multiple models need time to think.',
    serverErrorMessage: 'System processing error. The AI collaboration network is experiencing issues.',
    unauthorizedMessage: 'Access denied. Please join the roundtable with proper credentials.',
  } as const,

  rateLimitInfo: {
    name: BRAND.name,
    website: BRAND.website,
  } as const,

  supportEmail: BRAND.support,
} as const;
