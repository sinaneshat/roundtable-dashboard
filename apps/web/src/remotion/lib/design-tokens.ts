/**
 * Video Design Tokens
 * Imports actual brand constants from the app for consistent branding
 * Plus video-specific additions for 1920x1080 compositions
 */

import { BRAND } from '@/constants/brand';

// Re-export brand for use in compositions
export { BRAND };

// Background colors (video-optimized dark theme using OKLCH)
export const BACKGROUNDS = {
  primary: 'oklch(0.18 0 0)', // --background
  secondary: 'oklch(0.22 0 0)', // --card
  card: 'oklch(0.269 0 0)', // --muted
  elevated: 'oklch(0.3 0 0)', // slightly lighter for elevated elements
} as const;

// Dark theme colors from globals.css (OKLCH values)
export const COLORS = {
  background: 'oklch(0.18 0 0)', // --background (#1a1a1a)
  foreground: 'oklch(0.87 0 0)', // --foreground (#dedede)
  card: 'oklch(0.22 0 0)', // --card (#282828)
  cardForeground: 'oklch(0.87 0 0)', // --card-foreground (#dedede)
  muted: 'oklch(0.269 0 0)', // --muted (#3a3a3a)
  mutedForeground: 'oklch(0.75 0 0)', // --muted-foreground (#a3a3a3)
  border: 'oklch(0.4 0 0 / 60%)', // --border (rgba(77, 77, 77, 0.6))
  primary: 'oklch(0.922 0 0)', // --primary (#eaeaea)
  primaryForeground: 'oklch(0.205 0 0)', // --primary-foreground
  secondary: 'oklch(0.269 0 0)', // --secondary (#3a3a3a)
  destructive: 'oklch(0.704 0.191 22.216)', // --destructive (red)
  success: 'oklch(0.696 0.17 162.48)', // --success (green)
  warning: 'oklch(0.769 0.188 70.08)', // --warning (amber)
  info: 'oklch(0.488 0.243 264.376)', // --info (blue)
  input: 'oklch(0.45 0 0 / 70%)', // --input
  ring: 'oklch(0.65 0 0)', // --ring
  // Feature-specific colors
  blue500: '#3b82f6', // Voice recording theme
  purple500: '#a855f7', // Auto mode gradient
  purpleGradient: 'linear-gradient(to right, rgba(139, 92, 246, 0.2), rgba(168, 85, 247, 0.2), rgba(217, 70, 239, 0.2))',
} as const;

// Hex equivalents for Remotion (OKLCH not supported in all contexts)
export const HEX_COLORS = {
  background: '#1a1a1a',
  foreground: '#dedede',
  card: '#282828',
  secondary: '#3a3a3a', // User message background
  muted: '#3a3a3a',
  mutedForeground: '#a3a3a3',
  border: 'rgba(77, 77, 77, 0.6)',
  borderWhite12: 'rgba(255, 255, 255, 0.12)',
  borderWhite20: 'rgba(255, 255, 255, 0.2)',
  borderWhite30: 'rgba(255, 255, 255, 0.3)',
  primary: '#eaeaea',
  primary60: 'rgba(234, 234, 234, 0.6)', // Streaming indicator
  white: '#ffffff',
  black: '#000000',
  blue500: '#3b82f6',
  blue300: '#93c5fd', // Web search icon
  purple500: '#a855f7',
  destructive: '#dc2626', // Mic recording red (hsl(0, 84.2%, 60.2%))
} as const;

// Font stack matching globals.css
// Noto Sans: universal multilingual font (Latin + Arabic/Persian/Urdu)
export const FONTS = {
  sans: '\'Noto Sans\', \'Noto Sans Arabic\', system-ui, -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif',
  mono: 'ui-monospace, SFMono-Regular, \'SF Mono\', Menlo, Consolas, \'Liberation Mono\', monospace',
} as const;

// Font weights matching globals.css @import (400, 500, 600, 700)
export const FONT_WEIGHTS = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

// Text colors
export const TEXT = {
  primary: COLORS.foreground,
  secondary: 'oklch(0.87 0 0 / 70%)',
  muted: 'oklch(0.87 0 0 / 50%)',
  accent: BRAND.colors.primary,
} as const;

// AI Provider brand colors (matching actual app providers)
export const AI_PROVIDERS = {
  claude: {
    primary: '#d97706', // Amber (Anthropic)
    bg: 'rgba(217, 119, 6, 0.15)',
    name: 'Claude',
  },
  openai: {
    primary: '#10b981', // Emerald (OpenAI)
    bg: 'rgba(16, 185, 129, 0.15)',
    name: 'GPT-4o',
  },
  gemini: {
    primary: '#3b82f6', // Blue (Google)
    bg: 'rgba(59, 130, 246, 0.15)',
    name: 'Gemini',
  },
} as const;

// Rainbow gradient from actual brand - all 12 colors
export const RAINBOW = {
  colors: BRAND.logoGradient, // All 12 colors
  gradient: (rotation: number) =>
    `linear-gradient(${rotation}deg, ${BRAND.logoGradient.join(', ')})`,
  // Convenience presets
  horizontal: `linear-gradient(90deg, ${BRAND.logoGradient.join(', ')})`,
  vertical: `linear-gradient(180deg, ${BRAND.logoGradient.join(', ')})`,
  diagonal: `linear-gradient(135deg, ${BRAND.logoGradient.join(', ')})`,
} as const;

// Cinematic spring presets for Remotion animations
export const SPRINGS = {
  snappy: { damping: 25, stiffness: 200 },
  cinematic: { damping: 40, stiffness: 100, mass: 1.2 },
  bouncy: { damping: 15, stiffness: 100, mass: 0.8 },
  gentle: { damping: 30, stiffness: 80, mass: 1 },
  quick: { damping: 20, stiffness: 300, mass: 0.5 },
} as const;

// Typography scales (video-optimized for 1920x1080)
// All styles include fontFamily for consistency
export const TYPOGRAPHY = {
  hero: {
    fontFamily: FONTS.sans,
    fontSize: 72,
    fontWeight: FONT_WEIGHTS.bold,
    lineHeight: 1.1,
  },
  h1: {
    fontFamily: FONTS.sans,
    fontSize: 56,
    fontWeight: FONT_WEIGHTS.bold,
    lineHeight: 1.2,
  },
  h2: {
    fontFamily: FONTS.sans,
    fontSize: 42,
    fontWeight: FONT_WEIGHTS.semibold,
    lineHeight: 1.3,
  },
  h3: {
    fontFamily: FONTS.sans,
    fontSize: 32,
    fontWeight: FONT_WEIGHTS.semibold,
    lineHeight: 1.4,
  },
  body: {
    fontFamily: FONTS.sans,
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.regular,
    lineHeight: 1.5,
  },
  bodyMedium: {
    fontFamily: FONTS.sans,
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.medium,
    lineHeight: 1.5,
  },
  small: {
    fontFamily: FONTS.sans,
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.regular,
    lineHeight: 1.5,
  },
  smallMedium: {
    fontFamily: FONTS.sans,
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.medium,
    lineHeight: 1.5,
  },
  caption: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
    lineHeight: 1.4,
  },
  label: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.medium,
    lineHeight: 1.4,
  },
} as const;

// Spacing scale
export const SPACING = {
  'xs': 8,
  'sm': 16,
  'md': 24,
  'lg': 32,
  'xl': 48,
  '2xl': 64,
  '3xl': 96,
} as const;

// Border radius
export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

// Glass effect values for video (no hover states needed)
export const GLASS = {
  blur: 20,
  bgOpacity: 0.1,
  borderOpacity: 0.15,
} as const;

// Feature data for PHFeaturesScene
export const FEATURES = [
  { icon: '🤖', label: 'Multi-Model AI', description: 'Claude, GPT-4, Gemini in one chat' },
  { icon: '✨', label: 'Smart Synthesis', description: 'AI-powered response merging' },
  { icon: '🧠', label: 'Project Memory', description: 'Context that persists' },
  { icon: '🔍', label: 'Web Search', description: 'Real-time information' },
] as const;
