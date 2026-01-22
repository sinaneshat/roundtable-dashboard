/**
 * Storage Enums
 *
 * Enums for browser storage types and operations.
 * Optimized: Zod schemas lazy-loaded to reduce initial bundle size.
 */

// ============================================================================
// STORAGE TYPE
// ============================================================================

// 1. ARRAY CONSTANT
export const STORAGE_TYPES = ['session', 'local'] as const;

// 2. TYPESCRIPT TYPE (no Zod dependency)
export type StorageType = (typeof STORAGE_TYPES)[number];

// 3. DEFAULT VALUE
export const DEFAULT_STORAGE_TYPE: StorageType = 'local';

// 4. CONSTANT OBJECT
export const StorageTypes = {
  SESSION: 'session' as const,
  LOCAL: 'local' as const,
} as const;

// 5. TYPE GUARD (no Zod - simple runtime check)
export function isStorageType(value: unknown): value is StorageType {
  return typeof value === 'string' && STORAGE_TYPES.includes(value as StorageType);
}

// 6. DISPLAY LABELS
export const STORAGE_TYPE_LABELS: Record<StorageType, string> = {
  [StorageTypes.SESSION]: 'Session Storage',
  [StorageTypes.LOCAL]: 'Local Storage',
} as const;

// 7. ZOD SCHEMA (lazy-loaded only when validation is needed)
export async function getStorageTypeSchema() {
  const { z } = await import('zod');
  return z.enum(STORAGE_TYPES);
}
