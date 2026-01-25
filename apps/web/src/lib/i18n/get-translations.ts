/**
 * Server-side translation functions
 */

import enCommon from '@/i18n/locales/en/common.json';

import type { Messages, TranslationFunction } from './use-translations';

/**
 * Type guard for checking if value is a nested translation object
 */
function isTranslationObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (!isTranslationObject(current)) {
      return undefined;
    }
    current = current[key];
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Server-side translation function (for SSR/loaders)
 */
export async function getTranslations(namespace?: string): Promise<TranslationFunction> {
  const messages = enCommon as Messages;

  return (key: string, values?: Record<string, string | number>): string => {
    const fullKey = namespace ? `${namespace}.${key}` : key;
    let translation = getNestedValue(messages, fullKey);

    if (!translation) {
      console.error(`[i18n] Missing translation: ${fullKey}`);
      return fullKey;
    }

    if (values) {
      for (const [placeholder, value] of Object.entries(values)) {
        translation = translation.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), String(value));
      }
    }

    return translation;
  };
}
