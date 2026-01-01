/**
 * Email Design Tokens
 *
 * Comprehensive design system for email templates with email-safe properties.
 * All values are converted to pixels for maximum email client compatibility.
 */

import { getAppBaseUrl } from '@/lib/config/base-urls';

// Environment configuration - uses centralized URL config
export const baseUrl = getAppBaseUrl();

// Brand Colors - Aligned with global.css design system light mode (OKLCH converted to hex)
export const colors = {
  // Primary Brand Color - matching global.css primary oklch(0.5283 0.2168 262.1556)
  primary: '#6952F0', // Vibrant purple from new OKLCH theme
  primaryForeground: '#FFFFFF', // oklch(1.0000 0 0)
  primaryHover: '#5745D9', // Slightly darker for hover states

  // Core Colors from global.css light mode (OKLCH to hex)
  background: '#FFFFFF', // oklch(1.0000 0 0)
  foreground: '#3B3A43', // oklch(0.2622 0.0133 264.3133)
  card: '#FFFFFF', // oklch(1.0000 0 0)
  cardForeground: '#3B3A43', // oklch(0.2622 0.0133 264.3133)

  // Secondary & Muted - OKLCH to hex
  secondary: '#F5F5F7', // oklch(0.9686 0.0035 247.8590)
  secondaryForeground: '#3B3A43', // oklch(0.2622 0.0133 264.3133)
  muted: '#F5F5F7', // oklch(0.9686 0.0035 247.8590)
  mutedForeground: '#615F6B', // oklch(0.4240 0.0150 248.1807)

  // Accent matching global.css
  accent: '#F5F5F7', // oklch(0.9686 0.0035 247.8590)
  accentForeground: '#3B3A43', // oklch(0.2622 0.0133 264.3133)

  // Border matching global.css
  border: '#E8E7EC', // oklch(0.9258 0.0132 255.0276)
  input: '#E8E7EC', // oklch(0.9258 0.0132 255.0276)
  ring: '#6952F0', // oklch(0.5283 0.2168 262.1556)

  // Semantic Colors (minimal, email-safe)
  destructive: '#E04848', // oklch(0.6356 0.2082 25.3782)
  destructiveForeground: '#FFFFFF',

  // Text hierarchy aligned with global system
  textPrimary: '#3B3A43', // Main text - foreground color
  textSecondary: '#615F6B', // Secondary text - muted foreground
  textMuted: '#999999', // Even more muted
  textInverse: '#FFFFFF', // White text

  // Simplified backgrounds
  white: '#FFFFFF',
  backgroundPrimary: '#FFFFFF', // Card color
  backgroundSecondary: '#FFFFFF', // Background color
};

// Typography - Matching global.css font system with email-safe fallbacks
export const typography = {
  fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',

  fontSize: {
    'xs': '12px',
    'sm': '14px',
    'base': '16px',
    'lg': '18px',
    'xl': '20px',
    '2xl': '24px',
    '3xl': '30px',
    '4xl': '36px',
    '5xl': '48px',
  },

  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },

  lineHeight: {
    tight: '20px',
    normal: '24px',
    relaxed: '28px',
    loose: '32px',
  },

  letterSpacing: {
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
  },
};

// Spacing - Pixel-based for email compatibility
export const spacing = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
  24: '96px',
  32: '128px',
};

// Container sizes
export const containers = {
  email: '600px', // Standard email width
  content: '465px', // Content container (Vercel-style)
  mobile: '320px', // Mobile fallback
};

// Border radius - Matching global.css system (--radius: 0.5rem = 8px)
export const borderRadius = {
  none: '0px',
  sm: '4px', // --radius - 4px
  base: '6px', // --radius - 2px
  md: '8px', // --radius (0.5rem = 8px)
  lg: '12px', // --radius + 4px
  xl: '16px', // larger variant
  full: '9999px',
};

// Shadows - Email-safe
export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  none: 'none',
};

// Component variants - Aligned with global.css design system
export const components = {
  button: {
    primary: {
      'backgroundColor': colors.primary,
      'color': colors.primaryForeground,
      'borderColor': colors.primary,
      'borderRadius': borderRadius.md,
      ':hover': {
        backgroundColor: colors.primaryHover,
      },
    },
    secondary: {
      'backgroundColor': colors.secondary,
      'color': colors.secondaryForeground,
      'borderColor': colors.border,
      'borderRadius': borderRadius.md,
      ':hover': {
        backgroundColor: colors.muted, // Use muted color for hover
      },
    },
    outline: {
      'backgroundColor': 'transparent',
      'color': colors.foreground,
      'borderColor': colors.border,
      'borderRadius': borderRadius.md,
      ':hover': {
        backgroundColor: colors.secondary,
      },
    },
    ghost: {
      'backgroundColor': 'transparent',
      'color': colors.foreground,
      'borderColor': 'transparent',
      'borderRadius': borderRadius.md,
      ':hover': {
        backgroundColor: colors.secondary,
      },
    },
  },

  text: {
    heading1: {
      fontSize: typography.fontSize['3xl'],
      fontWeight: typography.fontWeight.bold,
      lineHeight: '36px',
      color: colors.foreground,
    },
    heading2: {
      fontSize: typography.fontSize['2xl'],
      fontWeight: typography.fontWeight.bold,
      lineHeight: '30px',
      color: colors.foreground,
    },
    heading3: {
      fontSize: typography.fontSize.xl,
      fontWeight: typography.fontWeight.semibold,
      lineHeight: '26px',
      color: colors.foreground,
    },
    heading4: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      lineHeight: typography.lineHeight.normal,
      color: colors.foreground,
    },
    body: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.normal,
      lineHeight: typography.lineHeight.normal,
      color: colors.foreground,
    },
    small: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.normal,
      lineHeight: '16px',
      color: colors.mutedForeground,
    },
    caption: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.normal,
      lineHeight: '16px',
      color: colors.textMuted,
    },
  },
};

// Layout presets - Using updated color system
export const layouts = {
  container: {
    maxWidth: containers.content,
    margin: '40px auto',
    padding: spacing[5],
    backgroundColor: colors.backgroundPrimary,
    borderRadius: borderRadius.md,
  },

  section: {
    margin: `${spacing[8]} 0`,
  },

  header: {
    textAlign: 'center' as const,
    margin: `${spacing[8]} 0`,
  },

  footer: {
    textAlign: 'center' as const,
    margin: `${spacing[6]} 0`,
    padding: `${spacing[4]} 0`,
    borderTop: `1px solid ${colors.border}`,
    color: colors.textSecondary,
  },
};

// Asset URLs
export const assets = {
  logo: `${baseUrl}/static/logo.png`,
  logoBlack: `${baseUrl}/static/logo.png`,
  logoRound: `${baseUrl}/static/logo.png`,
  logoRoundWhite: `${baseUrl}/static/logo.png`,
  logoRoundBlack: `${baseUrl}/static/logo.png`,
  fallbackAvatar: `${baseUrl}/static/images/avatar-placeholder.png`,
  placeholder: `${baseUrl}/static/images/placeholder/placeholder.svg`,
};
