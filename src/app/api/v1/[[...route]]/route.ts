import type { NextRequest } from 'next/server';

import api from '@/api';

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

    // Create a mock ExecutionContext for local development
    // In production (Cloudflare Workers), this is provided automatically
    // In local dev (Next.js), we need to create a mock to prevent errors
    const mockExecutionCtx = {
      waitUntil: (promise: Promise<unknown>) => {
        // In local dev, just run the promise without blocking the response
        promise.catch(() => {
          // Silently handle errors in background tasks
        });
      },
      passThroughOnException: () => {},
      props: {} as unknown,
    } as ExecutionContext;

    // All requests go to the main API (now includes docs)
    // IMPORTANT: Return the Response directly without awaiting to preserve streaming
    // The Response object may contain a ReadableStream that must not be buffered
    const response = await api.fetch(request, process.env, mockExecutionCtx);

    // For streaming responses, we need to ensure Next.js doesn't buffer the response
    // AI SDK v5 streaming uses various content types depending on the protocol
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
