/**
 * UI Component Enums
 *
 * Enums for UI component variants, sizes, and styling.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// COMPONENT VARIANT
// ============================================================================

export const COMPONENT_VARIANTS = ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link', 'white', 'success', 'warning', 'glass'] as const;

export const ComponentVariantSchema = z.enum(COMPONENT_VARIANTS);

export type ComponentVariant = z.infer<typeof ComponentVariantSchema>;

export const ComponentVariants = {
  DEFAULT: 'default' as const,
  DESTRUCTIVE: 'destructive' as const,
  OUTLINE: 'outline' as const,
  SECONDARY: 'secondary' as const,
  GHOST: 'ghost' as const,
  LINK: 'link' as const,
  WHITE: 'white' as const,
  SUCCESS: 'success' as const,
  WARNING: 'warning' as const,
  GLASS: 'glass' as const,
} as const;

// ============================================================================
// COMPONENT SIZE
// ============================================================================

export const COMPONENT_SIZES = ['sm', 'md', 'lg', 'xl', 'icon', 'default'] as const;

export const ComponentSizeSchema = z.enum(COMPONENT_SIZES);

export type ComponentSize = z.infer<typeof ComponentSizeSchema>;

export const ComponentSizes = {
  SM: 'sm' as const,
  MD: 'md' as const,
  LG: 'lg' as const,
  XL: 'xl' as const,
  ICON: 'icon' as const,
  DEFAULT: 'default' as const,
} as const;

// ============================================================================
// TEXT ALIGNMENT
// ============================================================================

export const TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;

export const TextAlignmentSchema = z.enum(TEXT_ALIGNMENTS);

export type TextAlignment = z.infer<typeof TextAlignmentSchema>;

export const TextAlignments = {
  LEFT: 'left' as const,
  CENTER: 'center' as const,
  RIGHT: 'right' as const,
  JUSTIFY: 'justify' as const,
} as const;

// ============================================================================
// TOAST VARIANT
// ============================================================================

export const TOAST_VARIANTS = ['default', 'destructive', 'success', 'warning', 'info', 'loading'] as const;

export const ToastVariantSchema = z.enum(TOAST_VARIANTS);

export type ToastVariant = z.infer<typeof ToastVariantSchema>;

export const ToastVariants = {
  DEFAULT: 'default' as const,
  DESTRUCTIVE: 'destructive' as const,
  SUCCESS: 'success' as const,
  WARNING: 'warning' as const,
  INFO: 'info' as const,
  LOADING: 'loading' as const,
} as const;

// ============================================================================
// REASONING STATE
// ============================================================================

export const REASONING_STATES = ['idle', 'thinking', 'complete'] as const;

export const ReasoningStateSchema = z.enum(REASONING_STATES);

export type ReasoningState = z.infer<typeof ReasoningStateSchema>;

export const ReasoningStates = {
  IDLE: 'idle' as const,
  THINKING: 'thinking' as const,
  COMPLETE: 'complete' as const,
} as const;
