/**
 * Safe storage utilities with built-in error handling.
 * Handles SSR, storage quota exceeded, and parse errors gracefully.
 */

import type { StorageType } from '@/lib/enums/storage';
import { DEFAULT_STORAGE_TYPE, StorageTypes } from '@/lib/enums/storage';

function getStorage(type: StorageType): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return type === StorageTypes.SESSION ? sessionStorage : localStorage;
}

/**
 * Safely get and parse JSON from storage.
 * Returns null on any error (SSR, parse error, missing key).
 */
export function safeStorageGet<T>(key: string, type: StorageType = DEFAULT_STORAGE_TYPE): T | null {
  const storage = getStorage(type);
  if (!storage) {
    return null;
  }

  try {
    const item = storage.getItem(key);
    return item ? JSON.parse(item) as T : null;
  } catch {
    return null;
  }
}

/**
 * Safely set JSON in storage.
 * Silently fails on quota exceeded or SSR.
 */
export function safeStorageSet<T>(key: string, value: T, type: StorageType = DEFAULT_STORAGE_TYPE): void {
  const storage = getStorage(type);
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or other storage error - fail silently
  }
}

/**
 * Safely remove item from storage.
 */
export function safeStorageRemove(key: string, type: StorageType = DEFAULT_STORAGE_TYPE): void {
  const storage = getStorage(type);
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    // Storage error - fail silently
  }
}

/**
 * Creates a typed storage helper for a specific key.
 * Provides get/set/clear methods with built-in type safety.
 */
export function createStorageHelper<T>(key: string, type: StorageType = DEFAULT_STORAGE_TYPE) {
  return {
    clear: (): void => safeStorageRemove(key, type),
    get: (): T | null => safeStorageGet<T>(key, type),
    set: (value: T): void => safeStorageSet(key, value, type),
  };
}
