import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import { purgeCache } from '@opennextjs/cloudflare/overrides/cache-purge/index';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';
import { withRegionalCache } from '@opennextjs/cloudflare/overrides/incremental-cache/regional-cache';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';
import d1NextTagCache from '@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache';

export default defineCloudflareConfig({
  // R2 Incremental Cache with Regional Cache for optimal ISR performance
  // @see https://opennext.js.org/cloudflare/caching#incremental-static-regeneration-isr
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: 'long-lived' }),

  // Durable Object Queue for ISR revalidation management
  // @see https://opennext.js.org/cloudflare/caching#queue
  queue: doQueue,

  // D1 Tag Cache for On-Demand revalidation (revalidateTag/revalidatePath)
  // @see https://opennext.js.org/cloudflare/caching#tag-cache-for-on-demand-revalidation
  tagCache: d1NextTagCache,

  // Enable cache interception for improved cold start performance on ISR/SSG routes
  // @see https://opennext.js.org/cloudflare/caching
  enableCacheInterception: true,

  // Automatic cache purge when pages are revalidated (requires zone setup)
  // Requires CACHE_PURGE_API_TOKEN and CACHE_PURGE_ZONE_ID secrets
  // @see https://opennext.js.org/cloudflare/caching#automatic-cache-purge
  cachePurge: purgeCache({ type: 'durableObject' }),
});
