# Environment Variables Guide

**This guide follows Cloudflare's official best practices for managing environment variables.**

Reference: [Cloudflare OpenNext Environment Variables](https://opennext.js.org/cloudflare/how-tos/environment-variables)

---

## 🎯 TL;DR - Quick Reference

| File | Purpose | Should Contain | Committed to Git? |
|------|---------|----------------|-------------------|
| `.dev.vars` | **Environment selector only** | `NEXTJS_ENV=development` | ❌ No |
| `.env` | Common variables for all environments | Shared config | ❌ No |
| `.env.development` | Development-specific variables | Dev secrets, local URLs | ❌ No |
| `.env.example` | Template for required variables | Placeholder values | ✅ Yes |
| `wrangler.jsonc` vars | Worker runtime variables | Can mirror .env values | ✅ Yes (no secrets) |

---

## 📖 Cloudflare's Recommended Approach

> "What you should do instead is to use the Next.js .env files. By doing so the environment variables will be available on process.env both while running next dev and when running your app locally on a Worker with wrangler dev."

### Why Use Next.js `.env` Files?

**Problem with `.dev.vars` or `wrangler.jsonc` vars:**
- ❌ Not available during `next dev` (only works with wrangler)
- ❌ Doesn't play well with the recommended development workflow
- ❌ Requires duplicating variables across files

**Solution: Use Next.js `.env` files:**
- ✅ Available in both `next dev` and `wrangler dev`
- ✅ Single source of truth for environment variables
- ✅ Follows Next.js conventions developers are familiar with
- ✅ Environment-specific files (`.env.development`, `.env.production`)

---

## 🔧 How It Works

### 1. Environment Selection

The `.dev.vars` file should **ONLY** contain `NEXTJS_ENV` to select which `.env` file to load:

```bash
# .dev.vars
NEXTJS_ENV=development
```

| `NEXTJS_ENV` Value | Loads `.env` File | Use Case |
|-------------------|------------------|----------|
| `development` | `.env.development` | Local development |
| `production` | (default) Uses production `.env` | Production builds |
| (not set) | `.env` only | Default behavior |

### 2. Loading Order

Next.js loads `.env` files in this order (higher priority first):

1. `.env.development` (when `NEXTJS_ENV=development`)
2. `.env.local` (loaded for all environments except test)
3. `.env`

**Example:**
```bash
# .dev.vars
NEXTJS_ENV=development

# Result: Loads .env.development, then .env
```

---

## 📂 File Structure

### `.dev.vars` (Environment Selector)

**Should ONLY contain:**
```bash
# Cloudflare Worker Development Environment Selector
NEXTJS_ENV=development
```

**Do NOT put actual environment variables here!**

### `.env` (Common Variables)

Variables shared across all environments:

```bash
# Common configuration for all environments
NEXT_PUBLIC_APP_NAME=Roundtable Dashboard
NEXT_PUBLIC_APP_VERSION=1.0.0
NODE_VERSION=22.14.0
PNPM_VERSION=10.10.0
```

### `.env.development` (Development Variables)

Development-specific variables and secrets:

```bash
# Development Environment Variables
NODE_ENV=development
NEXT_PUBLIC_WEBAPP_ENV=local
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Authentication (Development)
BETTER_AUTH_SECRET="your-dev-secret"
BETTER_AUTH_URL=http://localhost:3000

# Google OAuth (Development)
AUTH_GOOGLE_ID=your-dev-client-id.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=your-dev-client-secret

# Stripe (Test Mode)
STRIPE_SECRET_KEY=sk_test_your_test_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_test_key
```

### `.env.example` (Template)

Placeholder values for documentation:

```bash
# Essential Environment Variables Template
NODE_ENV=development
BETTER_AUTH_SECRET=your-better-auth-secret-32-chars-minimum
AUTH_GOOGLE_ID=your-google-client-id.apps.googleusercontent.com
# ... etc
```

---

## 🚀 Local Development

### Using `next dev`

```bash
pnpm dev
```

**Loads:**
1. `.env.development` (because `NODE_ENV=development` by default)
2. `.env.local` (if exists)
3. `.env`

**Available in:**
- ✅ Server components
- ✅ API routes
- ✅ Client-side (only `NEXT_PUBLIC_*` variables)

### Using `wrangler dev/preview`

```bash
pnpm preview
```

**Loads:**
1. `.dev.vars` → Reads `NEXTJS_ENV=development`
2. Then loads `.env.development`
3. Then loads `.env`

**Available in:**
- ✅ Server components
- ✅ API routes
- ✅ Cloudflare bindings (via `getCloudflareContext()`)

---

## 🌐 Production Deployment

### Setting Environment Variables

**For Cloudflare Workers, set environment variables in the dashboard:**

1. **Build Variables** (Workers Builds):
   - Go to: Workers & Pages → Your Project → Settings → Build variables
   - Add all `NEXT_PUBLIC_*` variables (needed at build time)
   - Add any variables needed for SSG pages

2. **Runtime Variables**:
   - Go to: Workers & Pages → Your Project → Settings → Environment Variables
   - Add all runtime variables (secrets, API keys, etc.)

3. **Secrets** (for sensitive values):
   ```bash
   # Set via wrangler CLI
   npx wrangler secret put BETTER_AUTH_SECRET --env=production
   npx wrangler secret put STRIPE_SECRET_KEY --env=production
   ```

### `--keep-vars` Flag

Our deployment scripts use `--keep-vars` to prevent dashboard-set variables from being deleted:

```json
// package.json
"deploy:preview": "... opennextjs-cloudflare deploy -- --env=preview --keep-vars",
"deploy:production": "... opennextjs-cloudflare deploy -- --env=production --keep-vars"
```

**Why this matters:**
- ✅ Preserves environment variables set in Cloudflare dashboard
- ✅ Prevents accidental deletion during deployments
- ✅ Allows centralized variable management

---

## 🔐 Security Best Practices

### DO ✅

- ✅ Use `.env.development` for local development secrets
- ✅ Add all `.env*` files to `.gitignore` (except `.env.example`)
- ✅ Use `.env.example` as a template (with placeholder values)
- ✅ Set production variables in Cloudflare dashboard
- ✅ Use `wrangler secret put` for sensitive production values
- ✅ Use `--keep-vars` in deployment scripts

### DON'T ❌

- ❌ Commit `.env`, `.dev.vars`, or `.env.development` to git
- ❌ Put actual secrets in `.env.example`
- ❌ Put environment variables in `.dev.vars` (except `NEXTJS_ENV`)
- ❌ Hardcode secrets in source code
- ❌ Deploy without `--keep-vars` (will delete dashboard variables)

---

## 🧪 Testing Your Setup

### Verify Local Development

```bash
# 1. Ensure .dev.vars only has NEXTJS_ENV
cat .dev.vars
# Should show: NEXTJS_ENV=development

# 2. Check .env.development exists
ls -la .env.development

# 3. Start dev server
pnpm dev

# 4. Verify variables are loaded
# In your app code:
console.log('Environment:', process.env.NEXT_PUBLIC_WEBAPP_ENV)
```

### Verify Wrangler Preview

```bash
# 1. Build and preview
pnpm preview

# 2. Check that variables load correctly
# Visit http://localhost:3000 and check browser console
```

### Verify Production

```bash
# 1. Set environment variables in Cloudflare dashboard
# 2. Deploy with --keep-vars
pnpm deploy:production

# 3. Visit production URL and verify
```

---

## 🔍 Troubleshooting

### Variables Not Available in `next dev`

**Problem:** Environment variables work in `wrangler dev` but not in `next dev`.

**Solution:** Move variables from `.dev.vars` or `wrangler.jsonc` to `.env.development`.

### Variables Not Available in Production

**Problem:** Variables work locally but not in production.

**Solution:**
1. Set variables in Cloudflare dashboard (Workers & Pages → Settings)
2. For `NEXT_PUBLIC_*` variables, also set in "Build variables"
3. Ensure deployment uses `--keep-vars` flag

### Secrets Exposed in Build Logs

**Problem:** Sensitive values appear in build logs.

**Solution:**
1. Use `wrangler secret put` instead of dashboard environment variables
2. Never log sensitive values in your code
3. Verify `.env*` files are in `.gitignore`

### `NEXTJS_ENV` Not Working

**Problem:** `.env.development` not loading even though `NEXTJS_ENV=development`.

**Solution:**
1. Verify `.dev.vars` contains only `NEXTJS_ENV=development`
2. Ensure you're using `wrangler dev` or `opennextjs-cloudflare preview`
3. For `next dev`, use `NODE_ENV=development` instead

---

## 📊 Variable Types

### `NEXT_PUBLIC_*` Variables

**Behavior:**
- ✅ Inlined at build time
- ✅ Available in client-side code
- ✅ Available in server-side code
- ⚠️ **Never put secrets here** (visible in browser)

**Example:**
```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### Server-Only Variables

**Behavior:**
- ✅ Available in server-side code only
- ✅ NOT available in client-side code
- ✅ Safe for secrets and API keys

**Example:**
```bash
BETTER_AUTH_SECRET=secret123
STRIPE_SECRET_KEY=sk_test_...
AUTH_GOOGLE_SECRET=secret456
```

---

## 🎯 Environment-Specific Configuration

### Local Development

```bash
# .dev.vars
NEXTJS_ENV=development

# .env.development
NEXT_PUBLIC_APP_URL=http://localhost:3000
STRIPE_SECRET_KEY=sk_test_...
```

### Preview Environment

**Set in Cloudflare Dashboard:**
```
NEXT_PUBLIC_APP_URL=https://app-preview.roundtable.now
STRIPE_SECRET_KEY=<secret via wrangler secret put>
```

### Production Environment

**Set in Cloudflare Dashboard:**
```
NEXT_PUBLIC_APP_URL=https://roundtable.now
STRIPE_SECRET_KEY=<secret via wrangler secret put>
```

---

## 📚 References

- [Cloudflare OpenNext: Environment Variables](https://opennext.js.org/cloudflare/how-tos/environment-variables)
- [Next.js Environment Variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)
- [Cloudflare Workers: Environment Variables](https://developers.cloudflare.com/workers/configuration/environment-variables/)
- [Wrangler: Environment Variables](https://developers.cloudflare.com/workers/wrangler/configuration/#environment-variables)

---

## ✅ Checklist

- [ ] `.dev.vars` contains **ONLY** `NEXTJS_ENV=development`
- [ ] `.env.development` contains all development variables
- [ ] `.env.example` has placeholder values (no secrets)
- [ ] All `.env*` files (except `.env.example`) are in `.gitignore`
- [ ] Deployment scripts use `--keep-vars` flag
- [ ] Production variables set in Cloudflare dashboard
- [ ] Secrets set via `wrangler secret put`
- [ ] No hardcoded secrets in source code
