/**
 * Server-side translation functions
 */

import enCommon from '@/i18n/locales/en/common.json';

import type { Messages, TranslationFunction } from './use-translations';

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
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
