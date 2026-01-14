import 'server-only';

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
 *   // Events auto-flush due to flushAt: 1 config
 *   // NO need to call shutdown() here
 * }
 * ```
 *
 * Reference: https://posthog.com/docs/libraries/next-js
 * Pattern: src/lib/posthog-server.ts
 */
import { PostHog } from 'posthog-node';
import { z } from 'zod';

// ============================================================================
// Analytics Constants
// ============================================================================

const ANONYMOUS_USER_ID = 'anonymous' as const;

let posthogClient: PostHog | null = null;

/**
 * Get or create PostHog server-side client instance
 *
 * Singleton pattern for edge environments (Cloudflare Workers).
 * Events flush immediately via flushAt: 1, flushInterval: 0.
 * No need to call shutdown() after individual captures.
 *
 * Returns null if in local environment or if API key is missing.
 * Enabled in preview and production environments.
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
 * Zod schema for PostHog cookie structure
 * PostHog stores distinct_id in cookie JSON payload
 */
const PostHogCookieSchema = z.object({
  distinct_id: z.string(),
}).passthrough();

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
    return ANONYMOUS_USER_ID;
  }

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
  if (!apiKey) {
    return ANONYMOUS_USER_ID;
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
      return ANONYMOUS_USER_ID;
    }

    // Decode and parse cookie value with Zod validation
    const decodedValue = decodeURIComponent(cookieValue);
    const parsed: unknown = JSON.parse(decodedValue);

    const result = PostHogCookieSchema.safeParse(parsed);
    if (!result.success) {
      return ANONYMOUS_USER_ID;
    }

    return result.data.distinct_id;
  } catch (error) {
    console.error('Failed to get PostHog distinct ID from cookie:', error);
    return ANONYMOUS_USER_ID;
  }
}

/**
 * Flush PostHog client events explicitly
 *
 * Normally not needed due to flushAt: 1 config (immediate flush).
 * Only use when you need to ensure events are sent before a critical operation.
 *
 * Note: Shutdown is handled automatically on process exit (see bottom of file).
 */
export async function flushPostHog(): Promise<void> {
  if (posthogClient) {
    await posthogClient.flush();
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
    ?? (options?.cookieHeader ? getDistinctIdFromCookie(options.cookieHeader) : ANONYMOUS_USER_ID);

  await posthog.captureException(error, distinctId, {
    $exception_source: 'backend',
    ...options?.properties,
  });
}

// Ensure PostHog is properly shut down on process termination
// Note: 'exit' event is synchronous and can't await async operations
// Use SIGTERM/SIGINT for graceful shutdown with async support
if (typeof process !== 'undefined') {
  const shutdownHandler = async () => {
    if (posthogClient) {
      try {
        await posthogClient.shutdown();
      } catch {
        // Ignore shutdown errors
      }
    }
    // Don't call process.exit() - let the normal termination continue
  };

  // Handle graceful shutdown signals
  process.on('SIGTERM', shutdownHandler);
  process.on('SIGINT', shutdownHandler);
  process.on('beforeExit', shutdownHandler);

  // Sync fallback for hard exit (best effort, may not complete)
  process.on('exit', () => {
    if (posthogClient) {
      posthogClient.shutdown();
    }
  });
}
