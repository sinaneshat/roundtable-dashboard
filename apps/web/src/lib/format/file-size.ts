/**
 * File Size Formatting Utilities
 *
 * Centralized file size formatting for consistent display across the application.
 */

/**
 * Format bytes to human-readable string
 *
 * @param bytes - Number of bytes to format (can be undefined for optional values)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string (e.g., "1.5 MB") or empty string if bytes is undefined/null/0
 *
 * @example
 * formatFileSize(1024) // "1.0 KB"
 * formatFileSize(1536, 2) // "1.50 KB"
 * formatFileSize(0) // "0 B"
 * formatFileSize(undefined) // ""
 */
export function formatFileSize(bytes: number | undefined | null, decimals = 1): string {
  if (bytes === undefined || bytes === null || bytes === 0) {
    return bytes === 0 ? '0 B' : '';
  }

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(decimals))} ${sizes[i]}`;
}
