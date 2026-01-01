# Cloudflare ISR Setup Guide

This document provides instructions for completing the ISR (Incremental Static Regeneration) setup for your Next.js application on Cloudflare Workers.

## ✅ Completed Configuration

The following has been configured for optimal ISR performance:

1. **R2 Incremental Cache** - Stores cached page data
2. **Regional Cache (Long-lived)** - Fast cache retrieval with lazy updates
3. **Durable Object Queue** - Manages ISR revalidation requests
4. **D1 Tag Cache** - Tracks on-demand revalidation via `revalidateTag`/`revalidatePath`
5. **Cache Interception** - Improved cold start performance
6. **Automatic Cache Purge** - Purges cache on revalidation

## 🔧 Required Manual Steps

### 1. Configure Cache Purge Secrets (Required for Custom Domains)

Cache purge requires your Cloudflare Zone ID and an API token with Cache Purge permissions.

#### Step 1: Get Your Zone ID

1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your domain (e.g., `roundtable.now`)
3. Copy the **Zone ID** from the right sidebar

#### Step 2: Create an API Token

1. Go to [API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Use the **Custom Token** template
4. Configure permissions:
   - **Zone** → **Cache Purge** → **Purge**
5. Select **Specific zones** → Choose your zone
6. Create token and copy it immediately

#### Step 3: Set Secrets

Run these commands to set the secrets for each environment:

```bash
# Preview environment
npx wrangler secret put CACHE_PURGE_API_TOKEN --env=preview
# Paste your API token when prompted

npx wrangler secret put CACHE_PURGE_ZONE_ID --env=preview
# Paste your Zone ID when prompted

# Production environment
npx wrangler secret put CACHE_PURGE_API_TOKEN --env=production
# Paste your API token when prompted

npx wrangler secret put CACHE_PURGE_ZONE_ID --env=production
# Paste your Zone ID when prompted
```

**Note**: Secrets are not needed for local development. Cache purge only works with custom domains (zones).

### 2. Update TypeScript Types

Generate TypeScript types for your Cloudflare environment:

```bash
pnpm cf-typegen
```

This will create/update `cloudflare-env.d.ts` with the latest bindings.

## 🧪 Testing ISR Configuration

### Test 1: Time-based Revalidation (ISR)

Create a test page with time-based revalidation:

```tsx
// app/test-isr/page.tsx
export const revalidate = 60; // Revalidate every 60 seconds

export default async function TestISR() {
  const timestamp = new Date().toISOString();

  return (
    <div>
      <h1>ISR Test Page</h1>
      <p>Generated at: {timestamp}</p>
      <p>This page will be regenerated every 60 seconds</p>
    </div>
  );
}
```

**Test Steps**:
1. Build and deploy: `pnpm deploy:preview`
2. Visit the page and note the timestamp
3. Refresh immediately - timestamp should be the same (cached)
4. Wait 60 seconds and refresh - timestamp should update

### Test 2: On-Demand Revalidation

Create a page with an API route that triggers revalidation:

```tsx
// app/test-revalidate/page.tsx
export default async function TestRevalidate() {
  const timestamp = new Date().toISOString();

  return (
    <div>
      <h1>On-Demand Revalidation Test</h1>
      <p>Generated at: {timestamp}</p>
      <form action="/api/revalidate" method="POST">
        <button type="submit">Revalidate Now</button>
      </form>
    </div>
  );
}
```

```tsx
// app/api/revalidate/route.ts
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

export async function POST() {
  revalidatePath('/test-revalidate');
  return NextResponse.json({ revalidated: true });
}
```

**Test Steps**:
1. Visit `/test-revalidate` and note the timestamp
2. Refresh - timestamp should be the same
3. Click "Revalidate Now"
4. Refresh the page - timestamp should update

### Test 3: Tag-based Revalidation

```tsx
// app/test-tags/page.tsx
export default async function TestTags() {
  const timestamp = new Date().toISOString();

  return (
    <div>
      <h1>Tag Revalidation Test</h1>
      <p>Generated at: {timestamp}</p>
    </div>
  );
}

export const revalidate = 3600; // 1 hour
export const tags = ['test-tag'];
```

```tsx
// app/api/revalidate-tag/route.ts
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

export async function POST() {
  revalidateTag('test-tag');
  return NextResponse.json({ revalidated: true });
}
```

**Test Steps**:
1. Visit `/test-tags` and note the timestamp
2. Call `POST /api/revalidate-tag`
3. Refresh `/test-tags` - timestamp should update

## 📊 Monitoring & Debugging

### View Queue Status

Durable Objects don't provide built-in monitoring, but you can check:

1. **Worker Logs**: Check Cloudflare dashboard → Workers → Logs
2. **Analytics**: Dashboard → Workers → Analytics
3. **Cache Hit Rates**: Dashboard → Caching → Analytics

### Debug Environment Variables

You can enable debug mode by setting in `wrangler.jsonc`:

```jsonc
"vars": {
  "OPEN_NEXT_DEBUG": "true"
}
```

### Check Tag Cache Database

View the revalidations table:

```bash
# Local
npx wrangler d1 execute NEXT_TAG_CACHE_D1 --local --command "SELECT * FROM revalidations ORDER BY revalidatedAt DESC LIMIT 10"

# Preview
npx wrangler d1 execute NEXT_TAG_CACHE_D1 --remote --env=preview --command "SELECT * FROM revalidations ORDER BY revalidatedAt DESC LIMIT 10"

# Production
npx wrangler d1 execute NEXT_TAG_CACHE_D1 --remote --env=production --command "SELECT * FROM revalidations ORDER BY revalidatedAt DESC LIMIT 10"
```

### Check R2 Cache

List cached items in your R2 bucket:

```bash
# Local (via wrangler dev)
npx wrangler r2 object list NEXT_INC_CACHE_R2_BUCKET --local

# Preview
npx wrangler r2 object list roundtable-dashboard-r2-cache-preview

# Production
npx wrangler r2 object list roundtable-dashboard-r2-cache-prod
```

## 🚀 Deployment Commands

### Local Development
```bash
pnpm dev                    # Next.js dev server with hot reload
pnpm preview               # Test in Workers runtime locally
```

### Preview Deployment
```bash
pnpm deploy:preview        # Deploy to preview environment
```

### Production Deployment
```bash
pnpm deploy:production     # Deploy to production environment
```

## 🔍 Troubleshooting

### ISR not working

1. **Check R2 Bucket**: Ensure `NEXT_INC_CACHE_R2_BUCKET` binding is correct
2. **Check Queue**: Verify Durable Objects are properly bound
3. **Check Logs**: Look for errors in Cloudflare dashboard
4. **Verify Build**: Run `pnpm build:worker` and check for errors

### On-demand revalidation not working

1. **Check Tag Cache**: Verify D1 database has revalidations table
2. **Check Service Binding**: Ensure `WORKER_SELF_REFERENCE` is correct
3. **Check Logs**: Look for revalidation errors in worker logs

### Cache purge not working

1. **Verify Zone Setup**: Cache purge only works with custom domains
2. **Check Secrets**: Ensure `CACHE_PURGE_API_TOKEN` and `CACHE_PURGE_ZONE_ID` are set
3. **Check API Token**: Verify token has Cache Purge permission
4. **Check Domain**: Ensure domain is properly configured in Cloudflare

## 📚 Additional Resources

- [OpenNext Cloudflare Docs](https://opennext.js.org/cloudflare)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Next.js ISR Documentation](https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
