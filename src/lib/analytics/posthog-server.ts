/**
 * PostHog Server-Side Client
 *
 * Server-side PostHog client for tracking events from:
 * - API routes (Hono handlers)
 * - Server components
 * - Server actions
 * - Background jobs
 *
 * Official PostHog Next.js pattern:
 * - Uses posthog-node SDK for server-side tracking
 * - Singleton pattern for client reuse
 * - Immediate flushing for edge environments
 * - Proper shutdown handling
 *
 * Usage in API routes:
 * ```ts
 * import { getPostHogClient } from '@/lib/analytics/posthog-server';
 *
 * const posthog = getPostHogClient();
 * if (posthog) {
 *   posthog.capture({
 *     distinctId: userId,
 *     event: 'api_event',
 *     properties: { ... }
 *   });
 *   await posthog.shutdown(); // Always shutdown after use
 * }
 * ```
 *
 * Reference: https://posthog.com/docs/libraries/next-js
 * Pattern: src/lib/posthog-server.ts
 */

import { PostHog } from 'posthog-node';

let posthogClient: PostHog | null = null;

/**
 * Get or create PostHog server-side client instance
 *
 * Returns null if in local environment or if API key is missing
 * Enabled in preview and production environments
 */
export function getPostHogClient(): PostHog | null {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
  const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  const environment = process.env.NEXT_PUBLIC_WEBAPP_ENV;

  // Disable in local environment, enable in preview and production
  if (environment === 'local' || !apiKey || !apiHost) {
    return null;
  }

  // Return existing client if already initialized
  if (posthogClient) {
    return posthogClient;
  }

  // Create new PostHog client
  posthogClient = new PostHog(apiKey, {
    host: apiHost,
    // Flush immediately for edge environments (Cloudflare Workers)
    flushAt: 1,
    flushInterval: 0,
  });

  return posthogClient;
}

/**
 * Extract PostHog distinct ID from request cookies
 *
 * PostHog stores the distinct ID in a cookie with the format:
 * ph_<project_api_key>_posthog
 *
 * Usage in API routes:
 * ```ts
 * const distinctId = getDistinctIdFromCookie(request.headers.get('cookie'));
 * ```
 */
export function getDistinctIdFromCookie(cookieHeader: string | null): string {
  if (!cookieHeader) {
    return 'anonymous';
  }

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
  if (!apiKey) {
    return 'anonymous';
  }

  const cookieName = `ph_${apiKey}_posthog`;

  try {
    // Parse cookies manually into map
    const cookies = cookieHeader.split(';').reduce<Map<string, string>>((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      if (key && value) {
        acc.set(key, value);
      }
      return acc;
    }, new Map<string, string>());

    const cookieValue = cookies.get(cookieName);
    if (!cookieValue) {
      return 'anonymous';
    }

    // Decode and parse cookie value with runtime validation
    const decodedValue = decodeURIComponent(cookieValue);
    const parsed: unknown = JSON.parse(decodedValue);

    // Type guard: validate PostHog cookie structure
    if (
      parsed !== null
      && typeof parsed === 'object'
      && 'distinct_id' in parsed
      && typeof parsed.distinct_id === 'string'
    ) {
      return parsed.distinct_id;
    }

    return 'anonymous';
  } catch (error) {
    console.error('Failed to get PostHog distinct ID from cookie:', error);
    return 'anonymous';
  }
}

/**
 * Shutdown PostHog client and flush remaining events
 *
 * Call this when shutting down the server or after capturing events
 * in serverless environments (API routes, server actions)
 */
export async function shutdownPostHog(): Promise<void> {
  if (posthogClient) {
    await posthogClient.shutdown();
  }
}

type ExceptionProperties = Record<string, unknown>;

/**
 * Capture an exception server-side with optional user context
 *
 * Usage:
 * ```ts
 * await captureServerException(error, {
 *   cookieHeader: request.headers.get('cookie'),
 *   source: 'api',
 *   endpoint: '/api/users',
 * });
 * ```
 */
export async function captureServerException(
  error: Error | unknown,
  options?: {
    distinctId?: string;
    cookieHeader?: string | null;
    properties?: ExceptionProperties;
  },
): Promise<void> {
  const posthog = getPostHogClient();
  if (!posthog)
    return;

  const distinctId = options?.distinctId
    ?? (options?.cookieHeader ? getDistinctIdFromCookie(options.cookieHeader) : 'anonymous');

  await posthog.captureException(error, distinctId, {
    $exception_source: 'backend',
    ...options?.properties,
  });
}

// Ensure PostHog is shut down when the process exits
if (typeof process !== 'undefined') {
  process.on('exit', () => {
    if (posthogClient) {
      posthogClient.shutdown();
    }
  });
}
