/**
 * Web Search Utilities
 *
 * **TYPE-SAFE**: No unsafe URL parsing or force casting
 * **ERROR-SAFE**: All URL operations wrapped in try-catch with fallbacks
 *
 * @module lib/utils/web-search-utils
 */

/**
 * Safely extracts domain/hostname from a URL string
 *
 * @param url - URL string to parse (may be malformed)
 * @param fallback - Fallback value if parsing fails (default: empty string)
 * @returns Extracted hostname or fallback
 *
 * @example
 * ```ts
 * const domain = safeExtractDomain('https://example.com/path');
 * // => 'example.com'
 *
 * const invalid = safeExtractDomain('not-a-url', 'unknown');
 * // => 'unknown'
 * ```
 */
export function safeExtractDomain(url: string, fallback = ''): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    // URL parsing failed - return fallback
    return fallback;
  }
}

/**
 * Validates if a string is a valid URL
 *
 * @param url - String to validate
 * @returns True if valid URL, false otherwise
 *
 * @example
 * ```ts
 * isValidUrl('https://example.com'); // => true
 * isValidUrl('not-a-url'); // => false
 * ```
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return Boolean(parsed);
  } catch {
    return false;
  }
}

/**
 * Builds a Google favicon URL for a domain
 *
 * @param domain - Domain name or full URL
 * @param size - Icon size in pixels (default: 64)
 * @returns Google favicon service URL
 *
 * @example
 * ```ts
 * const faviconUrl = buildGoogleFaviconUrl('example.com');
 * // => 'https://www.google.com/s2/favicons?domain=example.com&sz=64'
 * ```
 */
export function buildGoogleFaviconUrl(domain: string, size = 64): string {
  // Extract domain if full URL provided
  const cleanDomain = isValidUrl(domain) ? safeExtractDomain(domain, domain) : domain;
  return `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=${size}`;
}

/**
 * Handles image load errors by suppressing console errors
 * and optionally triggering a fallback action
 *
 * @param event - Image error event
 * @param onFallback - Optional callback to trigger fallback behavior
 *
 * @example
 * ```tsx
 * <img
 *   src={imageUrl}
 *   onError={(e) => handleImageError(e, () => setImageFailed(true))}
 * />
 * ```
 */
export function handleImageError(
  event: React.SyntheticEvent<HTMLImageElement>,
  onFallback?: () => void,
): void {
  // Prevent default error propagation to console
  event.preventDefault();

  // Trigger fallback behavior if provided
  onFallback?.();
}
