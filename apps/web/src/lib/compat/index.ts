/**
 * TanStack Start Compatibility Layer
 *
 * Provides familiar APIs for navigation, i18n, and dynamic imports.
 * Use these instead of direct TanStack Router imports for cleaner code.
 *
 * @example
 * import { useRouter, Link, useTranslations, dynamic, Image } from '@/lib/compat';
 */

// Dynamic imports
export { default as dynamic } from './dynamic';

// i18n
export type { AbstractIntlMessages, Formats } from './i18n';
export {
  getRequestConfig,
  getTranslations,
  I18nProvider,
  NextIntlClientProvider,
  useTranslations,
} from './i18n';
// Image component
export type { ImageProps } from './image';
export { default as Image } from './image';

// Link component
export { default as Link, useLinkStatus } from './link';
// Navigation
export {
  redirect,
  usePathname,
  useRouter,
  useSearchParams,
} from './navigation';
