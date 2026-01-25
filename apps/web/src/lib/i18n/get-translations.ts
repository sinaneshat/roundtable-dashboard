/**
 * Server-side translation functions
 */

import enCommon from '@/i18n/locales/en/common.json';

import { getNestedValue } from './get-nested-value';
import type { Messages, TranslationFunction } from './use-translations';

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
