/**
 * Internationalization (i18n)
 *
 * Simple translation system with useTranslations hook.
 * English-only app using translation keys for maintainability.
 */

import type { ReactNode } from 'react';
import { createContext, use } from 'react';

import enCommon from '@/i18n/locales/en/common.json';

type Messages = Record<string, unknown>;
type TranslationFunction = (key: string, values?: Record<string, string | number>) => string;

const I18nContext = createContext<Messages>(enCommon as Messages);

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

type I18nProviderProps = {
  children: ReactNode;
  messages?: Messages;
  locale?: string;
  timeZone?: string;
  now?: Date;
};

/**
 * I18n context provider
 */
export function I18nProvider({ children, messages = enCommon as Messages }: I18nProviderProps) {
  return <I18nContext value={messages}>{children}</I18nContext>;
}

export type { Messages as AbstractIntlMessages };

export type Formats = {
  dateTime?: Record<string, Intl.DateTimeFormatOptions>;
  number?: Record<string, Intl.NumberFormatOptions>;
  list?: Record<string, Intl.ListFormatOptions>;
};

type RequestConfig = {
  locale: string;
  messages: Messages;
  formats?: Formats;
  timeZone?: string;
};

export function getRequestConfig(
  fn: () => Promise<RequestConfig>,
): () => Promise<RequestConfig> {
  return fn;
}
