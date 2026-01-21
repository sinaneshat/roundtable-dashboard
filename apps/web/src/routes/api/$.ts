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
 * Note: /api/og/* routes are handled separately by specific route files.
 */

import { createFileRoute } from '@tanstack/react-router';

import { BASE_URLS, getWebappEnv } from '@/lib/config/base-urls';

/**
 * Get the backend API server URL (without /api path - we forward the full path)
 * Uses request hostname as fallback for robust production deployment
 */
function getBackendOrigin(requestHost?: string): string {
  try {
    const env = getWebappEnv();
    const envConfig = BASE_URLS[env];

    if (envConfig?.api) {
      // Remove /api/v1 suffix to get just the origin
      return envConfig.api.replace('/api/v1', '');
    }
  } catch {
    // Environment detection failed, use hostname-based fallback
  }

  // Fallback: derive API URL from request hostname
  // roundtable.now -> api.roundtable.now
  // web-preview.roundtable.now -> api-preview.roundtable.now
  if (requestHost) {
    if (requestHost === 'roundtable.now') {
      return 'https://api.roundtable.now';
    }
    if (requestHost.includes('preview')) {
      return 'https://api-preview.roundtable.now';
    }
    if (requestHost === 'localhost' || requestHost.startsWith('localhost:')) {
      return 'http://localhost:8787';
    }
  }

  // Ultimate fallback for production
  return 'https://api.roundtable.now';
}

/**
 * Forward request to backend and return response
 */
async function proxyRequest(request: Request, path: string): Promise<Response> {
  // Extract host from request for fallback detection
  const requestUrl = new URL(request.url);
  const requestHost = requestUrl.host;

  const backendOrigin = getBackendOrigin(requestHost);
  // Preserve query string from original request
  const queryString = requestUrl.search; // Includes the '?' if present
  const targetUrl = `${backendOrigin}/api/${path}${queryString}`;

  // Clone headers, removing host (will be set by fetch)
  const headers = new Headers(request.headers);
  headers.delete('host');

  // Forward the request to the backend
  // Note: duplex is required for streaming request bodies but not in TypeScript's RequestInit type yet
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.body,
    duplex: request.body ? 'half' : undefined,
    redirect: 'manual', // Don't follow redirects, let client handle them
  } as RequestInit & { duplex?: 'half' });

  try {
    const response = await fetch(proxyRequest);

    // Clone response headers
    const responseHeaders = new Headers(response.headers);

    // Remove headers that shouldn't be forwarded
    responseHeaders.delete('content-encoding'); // Let the server handle compression
    responseHeaders.delete('transfer-encoding');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[API Proxy] Error forwarding request:', error);
    return new Response(
      JSON.stringify({ error: 'Backend unavailable', message: String(error) }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
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
      GET: async ({ request, params }) => {
        return proxyRequest(request, params._splat || '');
      },
      POST: async ({ request, params }) => {
        return proxyRequest(request, params._splat || '');
      },
      PUT: async ({ request, params }) => {
        return proxyRequest(request, params._splat || '');
      },
      PATCH: async ({ request, params }) => {
        return proxyRequest(request, params._splat || '');
      },
      DELETE: async ({ request, params }) => {
        return proxyRequest(request, params._splat || '');
      },
      OPTIONS: async ({ request, params }) => {
        return proxyRequest(request, params._splat || '');
      },
      HEAD: async ({ request, params }) => {
        return proxyRequest(request, params._splat || '');
      },
    },
  },
});
