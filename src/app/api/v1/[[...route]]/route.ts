import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { NextRequest } from 'next/server';

import api from '@/api';

/**
 * Creates a local development CloudflareEnv from process.env
 * Only includes environment variables, not Cloudflare bindings
 *
 * Type safety: In local dev, process.env provides string env vars but lacks
 * Cloudflare-specific bindings (R2, D1, KV, DurableObjects). The API code
 * handles missing bindings gracefully with runtime checks.
 *
 * This function is only used as a fallback when getCloudflareContext() fails,
 * which happens in local development without proper Cloudflare simulation.
 *
 * LIMITATION: Cannot avoid type assertion here due to structural incompatibility
 * between NodeJS.ProcessEnv and CloudflareEnv. The spread copies all env vars,
 * but TypeScript cannot verify all required CloudflareEnv properties exist at
 * compile time. The API handles missing properties with runtime validation.
 */
function createLocalDevEnv(processEnv: NodeJS.ProcessEnv): CloudflareEnv {
  // Type assertion is necessary here:
  // - processEnv contains required env vars (NEXT_PUBLIC_*, AUTH_*, etc.)
  // - Cloudflare bindings are intentionally undefined for local dev
  // - API code validates required env vars at runtime via environment-validation middleware
  // - Missing bindings are handled gracefully in getDbAsync(), getKvAsync(), etc.
  const localEnv = {
    ...processEnv,
    // Cloudflare bindings are undefined in local dev - API handles gracefully
    DB: undefined,
    KV: undefined,
    UPLOADS_R2_BUCKET: undefined,
    NEXT_INC_CACHE_R2_BUCKET: undefined,
    TITLE_GENERATION_QUEUE: undefined,
    UPLOAD_CLEANUP_SCHEDULER: undefined,
  };

  // Double type assertion (via unknown) is required because NodeJS.ProcessEnv
  // and CloudflareEnv are structurally incompatible types. This is the only case
  // in the codebase where this pattern is acceptable because:
  // 1. We're bridging Node.js and Cloudflare runtime environments
  // 2. The API validates env vars at runtime (environment-validation middleware)
  // 3. Missing bindings are handled gracefully (getDbAsync(), getKvAsync(), etc.)
  //
  // This follows TypeScript's documented pattern for intentional incompatible casts.
  // @see https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-assertions
  return localEnv as unknown as CloudflareEnv;
}

/**
 * Creates a local development ExecutionContext
 * Tracks background promises for local testing
 *
 * Type safety: ExecutionContext.props is a Cloudflare-specific property for
 * passing data between middleware/handlers. In local dev, we provide an empty
 * object since we don't use this feature outside of production Workers.
 *
 * The type assertion is necessary because:
 * 1. ExecutionContext interface requires 'props' property
 * 2. Cloudflare Workers runtime auto-populates this in production
 * 3. Local dev doesn't have Cloudflare Workers runtime, so we provide a stub
 * 4. The API code doesn't rely on 'props' - it uses Hono's context instead
 */
function createLocalDevExecutionContext(
  pendingPromises: Promise<unknown>[],
): ExecutionContext {
  return {
    waitUntil: (promise: Promise<unknown>) => {
      pendingPromises.push(promise);
    },
    passThroughOnException: () => {
      // No-op in local dev
    },
    // Type assertion required: Local dev stub for Cloudflare Workers 'props' property
    // Production uses actual Cloudflare runtime - this is only for local development fallback
    props: {} as Record<string, unknown>,
  } as ExecutionContext;
}

// Factory function that creates a Next.js API route handler
function createApiHandler() {
  return async function (req: NextRequest) {
    // Extract the path after /api/v1
    const url = new URL(req.url);
    const path = url.pathname.replace('/api/v1', '') || '/';

    // Create a new request with the corrected path and preserve query parameters
    const newUrl = new URL(req.url);
    newUrl.pathname = path; // Set the corrected path directly
    const request = new Request(newUrl.toString(), {
      method: req.method,
      headers: req.headers,
      body: req.body,
      duplex: 'half',
    } as RequestInit);

    // Get Cloudflare context with proper bindings (R2, D1, KV, etc.)
    // In Cloudflare Workers: returns actual bindings from wrangler.jsonc
    // In local dev with initOpenNextCloudflareForDev: returns simulated bindings
    // Falls back to process.env if context unavailable
    let env: CloudflareEnv;
    let executionCtx: ExecutionContext;

    try {
      const cfContext = getCloudflareContext();
      env = cfContext.env;
      executionCtx = cfContext.ctx;

      // If executionCtx or waitUntil is missing, use fallback
      if (!executionCtx || !executionCtx.waitUntil) {
        throw new Error('Incomplete Cloudflare context');
      }
    } catch (error) {
      console.error('[API Route] Cloudflare context unavailable, using fallback:', error);
      // Local dev fallback: process.env contains environment variables but lacks Cloudflare-specific
      // bindings (R2, D1, KV, DurableObjects). The API code handles missing bindings gracefully.
      // We create a partial CloudflareEnv from process.env for local development.
      env = createLocalDevEnv(process.env);

      // Create waitUntil that tracks promises for background tasks
      const pendingPromises: Promise<unknown>[] = [];

      executionCtx = createLocalDevExecutionContext(pendingPromises);
    }

    // All requests go to the main API (now includes docs)
    // IMPORTANT: Return the Response directly without awaiting to preserve streaming
    // The Response object may contain a ReadableStream that must not be buffered
    const response = await api.fetch(request, env, executionCtx);

    // For streaming responses, we need to ensure Next.js doesn't buffer the response
    // AI SDK v6 streaming uses various content types depending on the protocol
    const contentType = response.headers.get('content-type') || '';
    const transferEncoding = response.headers.get('transfer-encoding') || '';

    // Detect streaming responses by checking:
    // 1. Content-Type (text/event-stream, text/plain, application/x-ndjson, etc.)
    // 2. Transfer-Encoding: chunked
    // 3. Presence of response.body stream
    const isStreamingResponse = contentType.includes('text/event-stream')
      || contentType.includes('text/plain')
      || contentType.includes('application/x-ndjson')
      || contentType.includes('application/octet-stream')
      || transferEncoding.includes('chunked')
      || (response.body !== null && typeof response.body === 'object');

    if (isStreamingResponse) {
      // For streaming responses, return the response directly
      // AI SDK's toTextStreamResponse() already includes proper streaming headers
      // We cannot create a new Response from response.body as it locks the stream
      return response;
    }

    return response;
  };
}

// Create a single handler instance for reuse across all HTTP methods
// Note: Next.js requires separate exports for each HTTP method, but they can share
// the same handler implementation when proxying to a unified API (like Hono.js)
const handler = createApiHandler();

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;
export const HEAD = handler;

/**
 * Dynamic configuration to prevent unnecessary static optimization
 * that might interfere with Hono's routing
 */
export const dynamic = 'force-dynamic';

/**
 * Enable streaming responses for AI SDK
 * This ensures Next.js doesn't buffer streaming responses
 */
// or 'edge' for edge runtime

/**
 * Increase max duration for streaming responses (10 minutes)
 * AI streaming can take longer than the default timeout
 */
export const maxDuration = 600;
