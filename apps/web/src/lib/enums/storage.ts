/**
 * Storage Enums
 *
 * Enums for browser storage types and operations.
 */

import { z } from 'zod';

// ============================================================================
// STORAGE TYPE
// ============================================================================

// 1. ARRAY CONSTANT
export const STORAGE_TYPES = ['session', 'local'] as const;

// 2. ZOD SCHEMA
export const StorageTypeSchema = z.enum(STORAGE_TYPES);

// 3. TYPESCRIPT TYPE (inferred from Zod)
export type StorageType = z.infer<typeof StorageTypeSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_STORAGE_TYPE: StorageType = 'local';

// 5. CONSTANT OBJECT
export const StorageTypes = {
  LOCAL: 'local' as const,
  SESSION: 'session' as const,
} as const;

// 6. TYPE GUARD (uses Zod safeParse - no type cast)
export function isStorageType(value: unknown): value is StorageType {
  return StorageTypeSchema.safeParse(value).success;
}

// 7. PARSE FUNCTION (returns typed value or undefined)
export function parseStorageType(value: unknown): StorageType | undefined {
  const result = StorageTypeSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

// 8. DISPLAY LABELS
export const STORAGE_TYPE_LABELS: Record<StorageType, string> = {
  [StorageTypes.LOCAL]: 'Local Storage',
  [StorageTypes.SESSION]: 'Session Storage',
} as const;
