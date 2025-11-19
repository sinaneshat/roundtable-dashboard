/**
 * Test Messages Configuration
 *
 * ✅ OFFICIAL PATTERN: Following next-intl testing best practices
 * Reference: https://next-intl-docs.vercel.app/docs/environments/testing
 *
 * This module provides a single source of truth for test translations,
 * importing directly from the production translation file to ensure
 * test translations stay in sync with production.
 *
 * Benefits:
 * - No duplication: Single import shared across all tests
 * - Type-safe: TypeScript validates message structure
 * - Maintainable: Changes to translations automatically reflected in tests
 * - Official pattern: Follows next-intl documentation exactly
 */

// ✅ Import actual production translations
// This ensures tests use the same messages as production
// Type inference: Let TypeScript infer the type from the JSON import
// NextIntlClientProvider accepts this structure natively
import messages from '@/i18n/locales/en/common.json';

/**
 * Test messages for next-intl
 *
 * Usage in tests:
 * ```tsx
 * import { render } from '@/lib/testing';
 * import { testMessages } from '@/lib/testing/test-messages';
 *
 * // Messages are already provided by TestProviders
 * render(<YourComponent />);
 * ```
 *
 * Direct usage (advanced):
 * ```tsx
 * import { NextIntlClientProvider } from 'next-intl';
 * import { testMessages } from '@/lib/testing/test-messages';
 *
 * <NextIntlClientProvider locale="en" messages={testMessages}>
 *   <YourComponent />
 * </NextIntlClientProvider>
 * ```
 */
export const testMessages = messages;

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
