/**
 * Email Component Enums
 *
 * Enums for email template styling and components.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// EMAIL TEXT WEIGHT
// ============================================================================

export const EMAIL_TEXT_WEIGHTS = ['normal', 'medium', 'semibold', 'bold'] as const;

export const EmailTextWeightSchema = z.enum(EMAIL_TEXT_WEIGHTS).openapi({
  description: 'Email text font weight',
  example: 'medium',
});

export type EmailTextWeight = z.infer<typeof EmailTextWeightSchema>;

export const EmailTextWeights = {
  NORMAL: 'normal' as const,
  MEDIUM: 'medium' as const,
  SEMIBOLD: 'semibold' as const,
  BOLD: 'bold' as const,
} as const;

// ============================================================================
// EMAIL COLOR
// ============================================================================

export const EMAIL_COLORS = ['primary', 'secondary', 'muted', 'white', 'failed', 'dark'] as const;

export const EmailColorSchema = z.enum(EMAIL_COLORS).openapi({
  description: 'Email component color scheme',
  example: 'primary',
});

export type EmailColor = z.infer<typeof EmailColorSchema>;

export const EmailColors = {
  PRIMARY: 'primary' as const,
  SECONDARY: 'secondary' as const,
  MUTED: 'muted' as const,
  WHITE: 'white' as const,
  FAILED: 'failed' as const,
  DARK: 'dark' as const,
} as const;

// ============================================================================
// EMAIL SPACING
// ============================================================================

export const EMAIL_SPACINGS = ['sm', 'md', 'lg'] as const;

export const EmailSpacingSchema = z.enum(EMAIL_SPACINGS).openapi({
  description: 'Email component spacing size',
  example: 'md',
});

export type EmailSpacing = z.infer<typeof EmailSpacingSchema>;

export const EmailSpacings = {
  SM: 'sm' as const,
  MD: 'md' as const,
  LG: 'lg' as const,
} as const;
