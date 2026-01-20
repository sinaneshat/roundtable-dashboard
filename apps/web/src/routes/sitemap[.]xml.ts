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

import { createFileRoute } from '@tanstack/react-router';

import { getAppBaseUrl, getWebappEnv, WEBAPP_ENVS } from '@/lib/config/base-urls';

type SitemapRoute = {
  path: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: string;
  lastmod?: string;
};

function getStaticRoutes(): SitemapRoute[] {
  return [
    // Homepage - highest priority
    { path: '/', changefreq: 'weekly', priority: '1.0' },
    // Auth pages
    { path: '/auth/sign-in', changefreq: 'monthly', priority: '0.8' },
    // Pricing
    { path: '/chat/pricing', changefreq: 'weekly', priority: '0.9' },
    // Legal pages
    { path: '/legal/terms', changefreq: 'monthly', priority: '0.5' },
    { path: '/legal/privacy', changefreq: 'monthly', priority: '0.5' },
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
        if (env !== WEBAPP_ENVS.PROD) {
          return new Response('Sitemap not available in non-production environments', {
            status: 404,
            headers: { 'Content-Type': 'text/plain' },
          });
        }

        const baseUrl = getAppBaseUrl();
        const routes = getStaticRoutes();
        const sitemapXml = generateSitemapXml(routes, baseUrl);

        return new Response(sitemapXml, {
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
          },
        });
      },
    },
  },
});
