/**
 * Test Messages Configuration
 *
 * Following next-intl testing best practices.
 * Reference: https://next-intl-docs.vercel.app/docs/environments/testing
 *
 * Re-exports production translations directly for test usage.
 */

export { default as testMessages } from '@/i18n/locales/en/common.json';

/**
 * Test locale configuration
 * Matches production locale settings
 */
export const testLocale = 'en';

/**
 * Test timezone configuration
 * Matches production timezone settings
 */
export const testTimeZone = 'UTC';
