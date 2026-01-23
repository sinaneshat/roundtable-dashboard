/**
 * Shared Service Types
 *
 * Centralized type definitions for API services
 * Eliminates inline type duplication across service files
 */

/**
 * Service options for SSR cookie forwarding and cache control
 *
 * Used by:
 * - Server functions that need to forward cookies during SSR
 * - Services that need HTTP cache bypass after billing changes
 */
export type ServiceOptions = {
  /** Cookie header for SSR - forwarded via context.cookieHeader */
  cookieHeader?: string;
  /** Bypass HTTP cache - used after billing/subscription changes */
  bypassCache?: boolean;
};
