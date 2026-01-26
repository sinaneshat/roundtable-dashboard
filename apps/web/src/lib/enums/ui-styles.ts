/**
 * UI Styles Enums
 *
 * Enums for CSS classes and styling utilities.
 */

import { z } from 'zod';

// ============================================================================
// BORDER RADIUS CLASS
// ============================================================================

// 1. ARRAY CONSTANT
export const BORDER_RADIUS_CLASSES = ['rounded-xl', 'rounded-2xl', 'rounded-lg', 'rounded-md'] as const;

// 2. ZOD SCHEMA
export const BorderRadiusClassSchema = z.enum(BORDER_RADIUS_CLASSES);

// 3. TYPESCRIPT TYPE (inferred from Zod)
export type BorderRadiusClass = z.infer<typeof BorderRadiusClassSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_BORDER_RADIUS_CLASS: BorderRadiusClass = 'rounded-xl';

// 5. CONSTANT OBJECT
export const BorderRadiusClasses = {
  LG: 'rounded-lg' as const,
  MD: 'rounded-md' as const,
  XL: 'rounded-xl' as const,
  XXL: 'rounded-2xl' as const,
} as const;

// 6. TYPE GUARD (uses Zod safeParse - no type cast)
export function isBorderRadiusClass(value: unknown): value is BorderRadiusClass {
  return BorderRadiusClassSchema.safeParse(value).success;
}

// 7. PARSE FUNCTION (returns typed value or undefined)
export function parseBorderRadiusClass(value: unknown): BorderRadiusClass | undefined {
  const result = BorderRadiusClassSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

// 8. DISPLAY LABELS
export const BORDER_RADIUS_CLASS_LABELS: Record<BorderRadiusClass, string> = {
  [BorderRadiusClasses.LG]: 'Large (8px)',
  [BorderRadiusClasses.MD]: 'Medium (6px)',
  [BorderRadiusClasses.XL]: 'Extra Large (12px)',
  [BorderRadiusClasses.XXL]: '2X Large (16px)',
} as const;

// 9. RADIUS PIXEL VALUES
export const BORDER_RADIUS_PIXEL_MAP: Record<BorderRadiusClass, number> = {
  [BorderRadiusClasses.LG]: 8,
  [BorderRadiusClasses.MD]: 6,
  [BorderRadiusClasses.XL]: 12,
  [BorderRadiusClasses.XXL]: 16,
} as const;
