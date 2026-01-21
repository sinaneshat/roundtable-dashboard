# Public Directory

Static assets served by Cloudflare Pages.

## Environment-Aware robots.txt

robots.txt is generated at build time based on environment:

### Template Files
- `robots.txt.local` - Local development (disallow all)
- `robots.txt.preview` - Preview environment (disallow all)
- `robots.txt.production` - Production (allow public pages, disallow protected routes)

### Generation Script
`scripts/generate-robots.sh [local|preview|production]`

### Build Commands
- `pnpm build:local` - Build with local robots.txt
- `pnpm build:preview` - Build with preview robots.txt (disallow all)
- `pnpm build:production` - Build with production robots.txt (allow crawling)

### Deployment
- `pnpm deploy:preview` - Deploys with preview robots.txt
- `pnpm deploy:production` - Deploys with production robots.txt

### Cache Headers
Configured in `_headers`:
- robots.txt: 24 hours (86400s)
- sitemap.xml: 24 hours (86400s)

## Other Files

- `sitemap.xml` - Site structure for crawlers
- `llms.txt` - LLM-friendly metadata
- `_headers` - Cloudflare Pages headers configuration
- `.well-known/` - Web standards metadata
- `icons/` - PWA and favicon icons
- `static/` - Static assets (images, OG images, etc.)
- `sw.js` - Service worker for offline support
