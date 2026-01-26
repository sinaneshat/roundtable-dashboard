/**
 * API Proxy Route - Catch-all for /api/*
 *
 * TanStack Start server route that proxies ALL /api/* requests to the backend.
 * This makes the frontend the single origin for all requests, eliminating CORS issues
 * and ensuring cookies work seamlessly in all environments.
 *
 * Architecture:
 * - Local: Frontend (5173) proxies to API (8787)
 * - Preview: Frontend proxies to api-preview.roundtable.now
 * - Production: Frontend proxies to api.roundtable.now
 *
 * Uses shared base-urls config as single source of truth with hostname-based fallback.
 *
 * Note: /api/og/* routes are handled separately by specific route files.
 */

import { createFileRoute } from '@tanstack/react-router';

import { getApiOriginWithFallback } from '@/lib/config/base-urls';

/**
 * Forward request to backend and return response
 */
async function proxyRequest(request: Request, path: string): Promise<Response> {
  // Extract host from request for fallback detection
  const requestUrl = new URL(request.url);
  const requestHost = requestUrl.host;

  // Get backend origin using shared config with hostname-based fallback
  const backendOrigin = getApiOriginWithFallback(requestHost);

  // Preserve query string from original request
  const queryString = requestUrl.search; // Includes the '?' if present
  const targetUrl = `${backendOrigin}/api/${path}${queryString}`;

  // Clone headers, removing host (will be set by fetch)
  const headers = new Headers(request.headers);
  headers.delete('host');

  // Forward the request to the backend
  // Note: duplex is required for streaming request bodies but not in TypeScript's RequestInit type yet
  const proxyRequestInit = new Request(targetUrl, {
    body: request.body,
    duplex: request.body ? 'half' : undefined,
    headers,
    method: request.method,
    redirect: 'manual', // Don't follow redirects, let client handle them
  } as RequestInit & { duplex?: 'half' });

  try {
    const response = await fetch(proxyRequestInit);

    // Clone response headers
    const responseHeaders = new Headers(response.headers);

    // Remove headers that shouldn't be forwarded
    responseHeaders.delete('content-encoding'); // Let the server handle compression
    responseHeaders.delete('transfer-encoding');

    return new Response(response.body, {
      headers: responseHeaders,
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error) {
    // Return 502 Bad Gateway if backend is unavailable
    return new Response(
      JSON.stringify({ error: 'Backend unavailable', message: String(error) }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 502,
      },
    );
  }
}

/**
 * Catch-all API route - handles all HTTP methods
 */
export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      DELETE: async ({ params, request }) => {
        return proxyRequest(request, params._splat || '');
      },
      GET: async ({ params, request }) => {
        return proxyRequest(request, params._splat || '');
      },
      HEAD: async ({ params, request }) => {
        return proxyRequest(request, params._splat || '');
      },
      OPTIONS: async ({ params, request }) => {
        return proxyRequest(request, params._splat || '');
      },
      PATCH: async ({ params, request }) => {
        return proxyRequest(request, params._splat || '');
      },
      POST: async ({ params, request }) => {
        return proxyRequest(request, params._splat || '');
      },
      PUT: async ({ params, request }) => {
        return proxyRequest(request, params._splat || '');
      },
    },
  },
});
