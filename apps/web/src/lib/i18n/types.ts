/**
 * I18n type definitions
 */

import type { Messages } from './use-translations';

export type { Messages as AbstractIntlMessages };

export type Formats = {
  dateTime?: Record<string, Intl.DateTimeFormatOptions>;
  number?: Record<string, Intl.NumberFormatOptions>;
  list?: Record<string, Intl.ListFormatOptions>;
};

export type RequestConfig = {
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
