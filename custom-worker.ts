/**
 * Custom Worker Entry Point
 *
 * Wraps the OpenNext generated worker and exports custom Durable Objects.
 * This allows us to use both OpenNext's built-in DO classes AND our custom
 * upload cleanup scheduler.
 *
 * @see https://opennext.js.org/cloudflare/howtos/custom-worker
 */

// Import the OpenNext generated handler
// @ts-expect-error - .open-next/worker.js is generated at build time
import handler from './.open-next/worker.js';

// Re-export OpenNext's Durable Object classes (required for caching)
// @ts-expect-error - .open-next/worker.js is generated at build time
export { BucketCachePurge, DOQueueHandler } from './.open-next/worker.js';

// Export our custom Durable Object for upload cleanup
export { UploadCleanupScheduler } from './src/workers/upload-cleanup-scheduler';

// Export the main worker handler
export default {
  fetch: handler.fetch,
} satisfies ExportedHandler<CloudflareEnv>;
