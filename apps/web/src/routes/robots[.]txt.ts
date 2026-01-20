/**
 * Dynamic robots.txt Server Route
 *
 * Generates robots.txt at request time based on environment:
 * - Local/Preview: Block all crawlers (Disallow: /)
 * - Production: Allow indexing with specific rules
 *
 * Benefits over static file approach:
 * - No build scripts needed
 * - Environment-aware at runtime
 * - CDN cacheable
 */

import { createFileRoute } from '@tanstack/react-router';

import { getAppBaseUrl, getWebappEnv, WEBAPP_ENVS } from '@/lib/config/base-urls';

function generateRobotsTxt(): string {
  const env = getWebappEnv();
  const baseUrl = getAppBaseUrl();

  if (env === WEBAPP_ENVS.LOCAL || env === WEBAPP_ENVS.PREVIEW) {
    return `# Roundtable - ${env === WEBAPP_ENVS.LOCAL ? 'Local Development' : 'Preview Environment'}
# ${baseUrl}

User-agent: *
Disallow: /

# ${env} environment - no indexing`;
  }

  // Production robots.txt
  return `# Roundtable - robots.txt
# ${baseUrl}

User-agent: *

# Allow public pages
Allow: /
Allow: /auth/sign-in
Allow: /chat/pricing
Allow: /legal/

# Disallow protected and private content
Disallow: /chat/
Disallow: /settings/
Disallow: /auth/callback
Disallow: /auth/error
Disallow: /api/
Disallow: /_build/

# Sitemap
Sitemap: ${baseUrl}/sitemap.xml

# Crawl-delay for respectful crawling
Crawl-delay: 1`;
}

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: async () => {
        const robotsTxt = generateRobotsTxt();

        return new Response(robotsTxt, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          },
        });
      },
    },
  },
});
