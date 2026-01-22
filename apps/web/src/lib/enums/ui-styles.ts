/**
 * UI Styles Enums
 *
 * Enums for CSS classes and styling utilities.
 * Optimized: Zod schemas lazy-loaded to reduce initial bundle size.
 */

// ============================================================================
// BORDER RADIUS CLASS
// ============================================================================

// 1. ARRAY CONSTANT
export const BORDER_RADIUS_CLASSES = ['rounded-xl', 'rounded-2xl', 'rounded-lg', 'rounded-md'] as const;

// 2. TYPESCRIPT TYPE (no Zod dependency)
export type BorderRadiusClass = (typeof BORDER_RADIUS_CLASSES)[number];

// 3. DEFAULT VALUE
export const DEFAULT_BORDER_RADIUS_CLASS: BorderRadiusClass = 'rounded-xl';

// 4. CONSTANT OBJECT
export const BorderRadiusClasses = {
  XL: 'rounded-xl' as const,
  XXL: 'rounded-2xl' as const,
  LG: 'rounded-lg' as const,
  MD: 'rounded-md' as const,
} as const;

// 5. TYPE GUARD (no Zod - simple runtime check)
export function isBorderRadiusClass(value: unknown): value is BorderRadiusClass {
  return typeof value === 'string' && BORDER_RADIUS_CLASSES.includes(value as BorderRadiusClass);
}

// 6. ZOD SCHEMA (lazy-loaded only when validation is needed)
export async function getBorderRadiusClassSchema() {
  const { z } = await import('zod');
  return z.enum(BORDER_RADIUS_CLASSES);
}

// 7. DISPLAY LABELS
export const BORDER_RADIUS_CLASS_LABELS: Record<BorderRadiusClass, string> = {
  [BorderRadiusClasses.XL]: 'Extra Large (12px)',
  [BorderRadiusClasses.XXL]: '2X Large (16px)',
  [BorderRadiusClasses.LG]: 'Large (8px)',
  [BorderRadiusClasses.MD]: 'Medium (6px)',
} as const;

// 8. RADIUS PIXEL VALUES
export const BORDER_RADIUS_PIXEL_MAP: Record<BorderRadiusClass, number> = {
  [BorderRadiusClasses.XL]: 12,
  [BorderRadiusClasses.XXL]: 16,
  [BorderRadiusClasses.LG]: 8,
  [BorderRadiusClasses.MD]: 6,
} as const;
