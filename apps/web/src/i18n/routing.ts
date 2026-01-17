// Simple i18n configuration without routing
export const locales = ['en'] as const;
export const defaultLocale = 'en';

export type Locale = (typeof locales)[number];
