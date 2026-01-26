/**
 * Dynamic sitemap.xml Server Route
 *
 * Generates sitemap at request time with all public routes.
 * Only generates sitemap for production - returns 404 for other environments.
 *
 * Benefits:
 * - Auto-includes all public routes
 * - Environment-aware (only indexes production)
 * - CDN cacheable
 * - Easy to extend with dynamic routes from database
 */

import { WebAppEnvs } from '@roundtable/shared/enums';
import { createFileRoute } from '@tanstack/react-router';

import { getAppBaseUrl, getWebappEnv } from '@/lib/config/base-urls';

type SitemapRoute = {
  path: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: string;
  lastmod?: string;
};

function getStaticRoutes(): SitemapRoute[] {
  return [
    // Homepage - highest priority
    { changefreq: 'weekly', path: '/', priority: '1.0' },
    // Auth pages
    { changefreq: 'monthly', path: '/auth/sign-in', priority: '0.8' },
    // Pricing
    { changefreq: 'weekly', path: '/chat/pricing', priority: '0.9' },
    // Legal pages
    { changefreq: 'monthly', path: '/legal/terms', priority: '0.5' },
    { changefreq: 'monthly', path: '/legal/privacy', priority: '0.5' },
  ];
}

function generateSitemapXml(routes: SitemapRoute[], baseUrl: string): string {
  const urlEntries = routes
    .map((route) => {
      const lastmodTag = route.lastmod ? `    <lastmod>${route.lastmod}</lastmod>\n` : '';
      return `  <url>
    <loc>${baseUrl}${route.path}</loc>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
${lastmodTag}  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const env = getWebappEnv();

        // Only serve sitemap in production
        if (env !== WebAppEnvs.PROD) {
          return new Response('Sitemap not available in non-production environments', {
            headers: { 'Content-Type': 'text/plain' },
            status: 404,
          });
        }

        const baseUrl = getAppBaseUrl();
        const routes = getStaticRoutes();
        const sitemapXml = generateSitemapXml(routes, baseUrl);

        return new Response(sitemapXml, {
          headers: {
            'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
            'Content-Type': 'application/xml; charset=utf-8',
          },
        });
      },
    },
  },
});
