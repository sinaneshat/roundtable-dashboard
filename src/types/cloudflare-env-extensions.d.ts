/**
 * CloudflareEnv Extensions
 *
 * Extends the generated CloudflareEnv interface with additional properties
 * that are not captured by wrangler types generation (e.g., secrets).
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface CloudflareEnv {
  /**
   * Internal secret for queue worker authentication.
   * Used to authenticate internal API calls from queue workers.
   * Set via `wrangler secret put INTERNAL_QUEUE_SECRET`
   */
  INTERNAL_QUEUE_SECRET?: string;
}
