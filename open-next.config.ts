import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';
import d1NextTagCache from '@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache';

export default defineCloudflareConfig({
  // R2 Incremental Cache for ISR/SSG
  incrementalCache: r2IncrementalCache,

  // Durable Object Queue for ISR revalidation
  queue: doQueue,

  // D1 Tag Cache for on-demand revalidation (revalidateTag/revalidatePath)
  tagCache: d1NextTagCache,
});
