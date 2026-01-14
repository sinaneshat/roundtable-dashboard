/**
 * next-intl TypeScript augmentation for compile-time translation key validation.
 *
 * This enables:
 * - Autocompletion for translation keys in useTranslations/getTranslations
 * - Compile-time errors for invalid/missing keys
 * - Type-safe namespace validation
 *
 * @see https://next-intl.dev/docs/workflows/typescript
 */
import type messages from './locales/en/common.json';

declare module 'next-intl' {
  // eslint-disable-next-line ts/consistent-type-definitions
  interface AppConfig {
    Messages: typeof messages;
  }
}
