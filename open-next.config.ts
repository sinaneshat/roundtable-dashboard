import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import { purgeCache } from '@opennextjs/cloudflare/overrides/cache-purge/index';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';
import { withRegionalCache } from '@opennextjs/cloudflare/overrides/incremental-cache/regional-cache';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';
import doShardedTagCache from '@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache';

export default defineCloudflareConfig({
  // R2 Incremental Cache with Regional Cache for optimal ISR performance
  incrementalCache: withRegionalCache(r2IncrementalCache, {
    mode: 'long-lived',
    shouldLazilyUpdateOnCacheHit: true,
  }),

  // Durable Object Queue for ISR revalidation management
  queue: doQueue,

  // DO Sharded Tag Cache for high-scale On-Demand revalidation
  tagCache: doShardedTagCache({
    baseShardSize: 12,
    regionalCache: true,
    regionalCacheTtlSec: 5,
    shardReplication: {
      numberOfSoftReplicas: 4,
      numberOfHardReplicas: 2,
    },
  }),

  // Enable cache interception for improved cold start performance on ISR/SSG routes
  enableCacheInterception: true,

  // Cache purge via Durable Object to buffer requests and avoid API rate limits
  cachePurge: purgeCache({ type: 'durableObject' }),
});
