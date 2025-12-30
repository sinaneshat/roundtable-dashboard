/**
 * UI Styling Utilities
 * Clean, focused utilities for className composition and common patterns
 */

import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Compose className strings with automatic conflict resolution
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Map z-index values to Tailwind classes for consistent layering
 * Use for sticky headers, modals, dropdowns, etc.
 *
 * @param zIndex - Numeric z-index value (10, 20, 30, 40, 50)
 * @returns Tailwind z-index class
 *
 * @example
 * getZIndexClass(50) // returns 'z-50'
 * getZIndexClass(999) // returns 'z-50' (clamped to max)
 */
export function getZIndexClass(zIndex: number): string {
  if (zIndex >= 50)
    return 'z-50';
  if (zIndex >= 40)
    return 'z-40';
  if (zIndex >= 30)
    return 'z-30';
  if (zIndex >= 20)
    return 'z-20';
  return 'z-10';
}
