import { getRequestConfig } from '@/lib/compat';

import { formats } from './formats';

export default getRequestConfig(async () => {
  // Only English is supported
  const locale = 'en';
  const messages = await import(`./locales/${locale}/common.json`).then(
    module => module.default,
  );

  return {
    locale,
    messages,
    formats,
    timeZone: 'UTC',
  };
});
