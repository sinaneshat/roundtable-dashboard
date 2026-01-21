/**
 * Translation hook for client components
 */

import { createContext, use } from 'react';

import enCommon from '@/i18n/locales/en/common.json';

import { getNestedValue } from './get-nested-value';

/**
 * Translation message value - can be a string or nested object of strings
 */
export type TranslationValue = string | { [key: string]: TranslationValue };

/**
 * Translation messages structure - recursive nested object
 */
export type Messages = { [key: string]: TranslationValue };

export type TranslationFunction = (key: string, values?: Record<string, string | number>) => string;

export const I18nContext = createContext<Messages>(enCommon as Messages);

/**
 * Translation hook
 *
 * @param namespace - Optional namespace prefix for translation keys
 * @returns Translation function t(key, values?)
 *
 * @example
 * const t = useTranslations('chat');
 * return <p>{t('welcome')}</p>; // Looks up 'chat.welcome'
 *
 * @example
 * const t = useTranslations();
 * return <p>{t('chat.welcome')}</p>; // Looks up 'chat.welcome'
 */
export function useTranslations(namespace?: string): TranslationFunction {
  const messages = use(I18nContext);

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
