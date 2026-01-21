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

// 3. TYPESCRIPT TYPE
export type StorageType = z.infer<typeof StorageTypeSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_STORAGE_TYPE: StorageType = 'local';

// 5. CONSTANT OBJECT
export const StorageTypes = {
  SESSION: 'session' as const,
  LOCAL: 'local' as const,
} as const;

// 6. TYPE GUARD
export function isStorageType(value: unknown): value is StorageType {
  return StorageTypeSchema.safeParse(value).success;
}

// 7. DISPLAY LABELS
export const STORAGE_TYPE_LABELS: Record<StorageType, string> = {
  [StorageTypes.SESSION]: 'Session Storage',
  [StorageTypes.LOCAL]: 'Local Storage',
} as const;
