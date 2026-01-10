import type { MetadataRoute } from 'next';

import { getAppBaseUrl } from '@/lib/config/base-urls';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAppBaseUrl();

  if (process.env.NEXT_PUBLIC_WEBAPP_ENV !== 'prod') {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/chat/pricing',
          '/auth/sign-in',
          '/auth/sign-up',
          '/public/chat/',
        ],
        disallow: [
          '/api/',
          '/chat/',
          '/auth/',
          '/_next/',
          '/private/',
          '/temp/',
          '*.json',
          '*.xml',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
