/**
 * PostHog Reverse Proxy Handler
 *
 * Proxies PostHog analytics requests through API to bypass ad blockers.
 * Routes:
 * - /ingest/static/* → us-assets.i.posthog.com/static/*
 * - /ingest/* → us.i.posthog.com/*
 */

import type { Context } from 'hono';

import { log } from '@/lib/logger';
import type { ApiEnv } from '@/types';

const POSTHOG_HOST = 'us.i.posthog.com';
const POSTHOG_ASSETS_HOST = 'us-assets.i.posthog.com';

/**
 * Standard CORS headers for PostHog proxy
 * Allow all origins since analytics should work from anywhere
 */
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Headers': 'Content-Type, X-PostHog-Token, X-PostHog-Decide-Version',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Max-Age': '86400', // Cache preflight for 24h
  };
}

/**
 * Proxy handler for PostHog ingest requests
 * Handles both static assets and API requests
 */
export async function ingestProxyHandler(c: Context<ApiEnv>): Promise<Response> {
  // Handle CORS preflight immediately - no need to proxy OPTIONS to PostHog
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      headers: getCorsHeaders(),
      status: 204,
    });
  }

  const path = c.req.path;
  const isStatic = path.startsWith('/ingest/static/');

  const targetHost = isStatic ? POSTHOG_ASSETS_HOST : POSTHOG_HOST;

  // Strip /ingest prefix, keep rest of path
  const targetPath = path.replace(/^\/ingest/, '');
  const url = new URL(c.req.url);
  const targetUrl = `https://${targetHost}${targetPath}${url.search}`;

  // Forward headers, set Host to PostHog domain
  const headers = new Headers();
  for (const [key, value] of c.req.raw.headers.entries()) {
    // Skip headers that shouldn't be forwarded
    if (['host', 'cookie', 'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'x-forwarded-for'].includes(key.toLowerCase())) {
      continue;
    }
    headers.set(key, value);
  }
  headers.set('Host', targetHost);

  // Forward real client IP for accurate geolocation (PostHog proxy requirement)
  const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  if (clientIp) {
    headers.set('X-Forwarded-For', clientIp);
  }

  try {
    // Build fetch options conditionally to avoid body on GET/HEAD requests
    const isBodyMethod = c.req.method !== 'GET' && c.req.method !== 'HEAD';
    const fetchOptions: RequestInit = {
      headers,
      method: c.req.method,
    };
    if (isBodyMethod && c.req.raw.body) {
      fetchOptions.body = c.req.raw.body;
    }
    const response = await fetch(targetUrl, fetchOptions);

    // Copy response headers, add CORS
    const responseHeaders = new Headers();
    for (const [key, value] of response.headers.entries()) {
      // Skip hop-by-hop headers
      if (['transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) {
        continue;
      }
      responseHeaders.set(key, value);
    }

    // Add CORS headers
    const corsHeaders = getCorsHeaders();
    for (const [key, value] of Object.entries(corsHeaders)) {
      responseHeaders.set(key, value);
    }

    return new Response(response.body, {
      headers: responseHeaders,
      status: response.status,
    });
  } catch (error) {
    log.http('error', 'PostHog proxy error', { error: error instanceof Error ? error.message : String(error) });
    // Return error with CORS headers so browser can read the error
    return new Response(JSON.stringify({ error: 'Proxy request failed' }), {
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
      status: 502,
    });
  }
}
