# Cloudflare Workers Deployment Guide

This monorepo deploys two Cloudflare Workers:
- **roundtable-api**: Hono API backend
- **roundtable-web**: TanStack Start frontend

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐     ┌─────────────────────┐           │
│  │  roundtable-web     │     │  roundtable-api     │           │
│  │  (TanStack Start)   │────▶│  (Hono)             │           │
│  │                     │     │                     │           │
│  │  Port: 5173 (dev)   │     │  Port: 8787 (dev)   │           │
│  └─────────────────────┘     └─────────────────────┘           │
│                                     │                           │
│                              ┌──────┴──────┐                    │
│                              │             │                    │
│                          ┌───▼───┐   ┌─────▼─────┐              │
│                          │  D1   │   │ R2/KV/DO  │              │
│                          │  DB   │   │ Bindings  │              │
│                          └───────┘   └───────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

## Environments

| Environment | API Worker | Web Worker | Branch |
|-------------|------------|------------|--------|
| Local | localhost:8787 | localhost:5173 | any |
| Preview | roundtable-api-preview | roundtable-web-preview | non-main |
| Production | roundtable-api-production | roundtable-web | main |

## Cloudflare Workers Builds Setup

### Step 1: Connect Repository

In the Cloudflare Dashboard, connect your repository to **4 Workers**.

**Important**: Root directory must be `/` (empty) to run from monorepo root where pnpm workspace and turbo are configured.

| Worker Name | Root Directory | Build Command | Deploy Command |
|-------------|----------------|---------------|----------------|
| `roundtable-api-preview` | `/` | `pnpm install` | `npx turbo run deploy:preview --filter=@roundtable/api` |
| `roundtable-api-production` | `/` | `pnpm install` | `npx turbo run deploy:production --filter=@roundtable/api` |
| `roundtable-web-preview` | `/` | `pnpm install` | `npx turbo run deploy:preview --filter=@roundtable/web` |
| `roundtable-web` | `/` | `pnpm install` | `npx turbo run deploy:production --filter=@roundtable/web` |

### Custom Domains

| Worker | Custom Domain |
|--------|---------------|
| `roundtable-api-preview` | `api-preview.roundtable.now` |
| `roundtable-api-production` | `api.roundtable.now` |
| `roundtable-web-preview` | `web-preview.roundtable.now` |
| `roundtable-web` | `roundtable.now` |

### Step 2: Configure Build Watch Paths

To optimize builds, configure watch paths for each worker:

**API Workers** (both preview and production):
```
apps/api/**
packages/shared/**
```

**Web Workers** (both preview and production):
```
apps/web/**
packages/shared/**
```

### Step 3: Configure Secrets

Secrets must be set via `wrangler secret put` for deployed environments:

```bash
# API Secrets (from apps/api/.dev.vars.example)
cd apps/api
wrangler secret put BETTER_AUTH_SECRET --env preview
wrangler secret put AUTH_GOOGLE_SECRET --env preview
wrangler secret put TURNSTILE_SECRET_KEY --env preview
wrangler secret put AWS_SES_ACCESS_KEY_ID --env preview
wrangler secret put AWS_SES_SECRET_ACCESS_KEY --env preview
wrangler secret put STRIPE_SECRET_KEY --env preview
wrangler secret put STRIPE_WEBHOOK_SECRET --env preview
wrangler secret put OPENROUTER_API_KEY --env preview
wrangler secret put POSTHOG_API_KEY --env preview
wrangler secret put POSTHOG_HOST --env preview

# Repeat with --env production for production secrets
```

## Local Development

### Prerequisites

```bash
# Install dependencies
pnpm install

# Setup local database
pnpm db:migrate:local
pnpm db:seed:local
```

### Configure Local Secrets

```bash
# Copy example files
cp apps/api/.dev.vars.example apps/api/.dev.vars
cp apps/web/.dev.vars.example apps/web/.dev.vars
cp apps/web/.env.example apps/web/.env

# Edit each file with your actual secrets
```

### Start Development

```bash
# Start both API and Web (turbo parallelizes)
pnpm dev

# Or start individually
pnpm dev:api  # API on http://localhost:8787
pnpm dev:web  # Web on http://localhost:5173
```

## Manual Deployment

```bash
# Deploy to preview
pnpm deploy:preview

# Deploy to production
pnpm deploy:production

# Or deploy specific app
pnpm api:deploy:preview
pnpm web:deploy:preview
```

## Type Generation

Cloudflare env types are auto-generated on build:

```bash
# Regenerate types manually
pnpm cf-typegen

# Check if types are up-to-date (for CI)
pnpm cf-typegen:check
```

## Environment Variables

### API (apps/api)

**Public Vars** (in `wrangler.jsonc`):
- `WEBAPP_ENV`: Environment identifier (local/preview/prod)
- `APP_NAME`, `APP_VERSION`: App metadata
- `R2_PUBLIC_URL`: Public R2 URL
- `BETTER_AUTH_URL`: Auth callback URL
- `NODE_ENV`: Node environment

**Secrets** (in `.dev.vars` locally, `wrangler secret` deployed):
- See `apps/api/.dev.vars.example` for full list

### Web (apps/web)

**Public Vars** (in `wrangler.jsonc`):
- `VITE_APP_NAME`: App name (client-side)
- `VITE_WEBAPP_ENV`: Environment (client-side)

**SSR Vars** (in `.env` locally):
- See `apps/web/.env.example` for full list

## Troubleshooting

### Build Fails

1. Ensure types are generated: `pnpm cf-typegen`
2. Check type errors: `pnpm check-types`
3. Verify wrangler.jsonc is valid JSON

### Secrets Not Found

1. Verify secrets are set: `wrangler secret list --env <env>`
2. Check `.dev.vars` file exists for local dev
3. Ensure secret names match exactly

### Database Issues

```bash
# Reset local database
pnpm db:full-reset:local

# Run migrations
pnpm db:migrate:local   # Local
pnpm db:migrate:preview # Preview
pnpm db:migrate:prod    # Production
```
