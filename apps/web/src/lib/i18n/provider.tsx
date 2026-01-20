/**
 * Internationalization (i18n) Provider Component
 *
 * Simple translation system with useTranslations hook.
 * English-only app using translation keys for maintainability.
 */

import type { ReactNode } from 'react';

import enCommon from '@/i18n/locales/en/common.json';

import type { Messages } from './use-translations';
import { I18nContext } from './use-translations';

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
