import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import { purgeCache } from '@opennextjs/cloudflare/overrides/cache-purge/index';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';
import { withRegionalCache } from '@opennextjs/cloudflare/overrides/incremental-cache/regional-cache';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';
import doShardedTagCache from '@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache';

export default defineCloudflareConfig({
  // Exclude React Email packages from edge bundle
  // These packages use react-dom/server which has Node.js APIs (MessageChannel)
  // that aren't available in Cloudflare Workers edge runtime
  // @see https://github.com/resend/react-email/issues/1630
  edgeExternals: [
    '@react-email/render',
    '@react-email/components',
    '@react-email/tailwind',
    'react-email',
  ],

  // R2 Incremental Cache with Regional Cache for optimal ISR performance
  incrementalCache: withRegionalCache(r2IncrementalCache, {
    mode: 'long-lived',
    shouldLazilyUpdateOnCacheHit: true,
  }),

  // Durable Object Queue for ISR revalidation management
  queue: doQueue,

  // DO Sharded Tag Cache - simplified for better latency
  // Previous config: 12 shards × 6 replicas = 72 DO instances (overkill)
  // New config: 4 shards × 3 replicas = 12 DO instances (adequate for most use cases)
  tagCache: doShardedTagCache({
    baseShardSize: 4,
    regionalCache: true,
    regionalCacheTtlSec: 10, // Increased from 5s to reduce DO requests
    shardReplication: {
      numberOfSoftReplicas: 2,
      numberOfHardReplicas: 1,
    },
  }),

  // Enable cache interception for improved cold start performance on ISR/SSG routes
  enableCacheInterception: true,

  // Cache purge via Durable Object to buffer requests and avoid API rate limits
  cachePurge: purgeCache({ type: 'durableObject' }),
});
