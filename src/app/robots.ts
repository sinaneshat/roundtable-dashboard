import type { MetadataRoute } from 'next';

import { getAppBaseUrl } from '@/lib/config/base-urls';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAppBaseUrl();

  // In development, disallow all crawling
  if (process.env.NEXT_PUBLIC_WEBAPP_ENV !== 'prod') {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    };
  }

  // In production, allow crawling with some restrictions
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
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
