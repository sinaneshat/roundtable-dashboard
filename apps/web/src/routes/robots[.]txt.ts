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

import { WebAppEnvs } from '@roundtable/shared/enums';
import { createFileRoute } from '@tanstack/react-router';

import { getAppBaseUrl, getWebappEnv } from '@/lib/config/base-urls';

function generateRobotsTxt(): string {
  const env = getWebappEnv();
  const baseUrl = getAppBaseUrl();

  if (env === WebAppEnvs.LOCAL || env === WebAppEnvs.PREVIEW) {
    return `# Roundtable - ${env === WebAppEnvs.LOCAL ? 'Local Development' : 'Preview Environment'}
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
Allow: /public/

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
Crawl-delay: 1

# =============================================================================
# AI Crawlers - Answer Engine Optimization (AEO)
# =============================================================================
# These rules allow AI assistants to index public content for training
# and answer generation while protecting private user conversations.

# OpenAI GPTBot - Used for ChatGPT and AI training
User-agent: GPTBot
Allow: /
Allow: /public/
Allow: /llms.txt
Disallow: /chat/
Disallow: /settings/
Disallow: /api/

# Anthropic Claude Web Crawler
User-agent: Claude-Web
Allow: /
Allow: /public/
Allow: /llms.txt
Disallow: /chat/
Disallow: /settings/
Disallow: /api/

# Perplexity AI
User-agent: PerplexityBot
Allow: /
Allow: /public/
Allow: /llms.txt
Disallow: /chat/
Disallow: /settings/
Disallow: /api/

# Amazon Alexa / AI services
User-agent: Amazonbot
Allow: /
Allow: /public/
Disallow: /chat/
Disallow: /settings/
Disallow: /api/

# Google AI (Bard/Gemini)
User-agent: Google-Extended
Allow: /
Allow: /public/
Allow: /llms.txt
Disallow: /chat/
Disallow: /settings/
Disallow: /api/

# Common Crawl (used by many AI training datasets)
User-agent: CCBot
Allow: /
Allow: /public/
Disallow: /chat/
Disallow: /settings/
Disallow: /api/`;
}

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: async () => {
        const robotsTxt = generateRobotsTxt();

        return new Response(robotsTxt, {
          headers: {
            'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
            'Content-Type': 'text/plain; charset=utf-8',
          },
        });
      },
    },
  },
});
