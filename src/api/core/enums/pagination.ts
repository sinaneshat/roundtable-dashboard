/**
 * Pagination Enums
 *
 * Enums for pagination direction and related patterns.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// CURSOR DIRECTION
// ============================================================================

export const CURSOR_DIRECTIONS = ['forward', 'backward'] as const;

export const DEFAULT_CURSOR_DIRECTION: CursorDirection = 'forward';

export const CursorDirectionSchema = z.enum(CURSOR_DIRECTIONS).openapi({
  description: 'Cursor pagination direction',
  example: 'forward',
});

export type CursorDirection = z.infer<typeof CursorDirectionSchema>;

export const CursorDirections = {
  FORWARD: 'forward' as const,
  BACKWARD: 'backward' as const,
} as const;

// ============================================================================
// CURSOR DIRECTION LABELS (UI Display)
// ============================================================================

export const CURSOR_DIRECTION_LABELS: Record<CursorDirection, string> = {
  [CursorDirections.FORWARD]: 'Next',
  [CursorDirections.BACKWARD]: 'Previous',
} as const;

// ============================================================================
// VALIDATION HELPER
// ============================================================================

export function isValidCursorDirection(value: unknown): value is CursorDirection {
  return typeof value === 'string' && CURSOR_DIRECTIONS.includes(value as CursorDirection);
}
