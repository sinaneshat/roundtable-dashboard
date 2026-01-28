/**
 * Internal API Utilities
 *
 * Shared utilities for making authenticated internal API calls from queue workers.
 * Used by round orchestration and job orchestration services.
 */

import { BASE_URL_CONFIG } from '@roundtable/shared';
import { BETTER_AUTH_SESSION_COOKIE_NAME, WebAppEnvs, WebAppEnvSchema } from '@roundtable/shared/enums';

/**
 * Get base URL for current environment
 */
export function getBaseUrl(env: { WEBAPP_ENV?: string }): string {
  const envResult = WebAppEnvSchema.safeParse(env.WEBAPP_ENV);
  const validEnv = envResult.success ? envResult.data : WebAppEnvs.LOCAL;
  return BASE_URL_CONFIG[validEnv].app;
}

/**
 * Build auth headers using user's session cookie
 *
 * Uses the session token from the original request (passed via queue message)
 * to authenticate with Better Auth - same as browser-based requests.
 */
export function buildSessionAuthHeaders(sessionToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Cookie': `${BETTER_AUTH_SESSION_COOKIE_NAME}=${sessionToken}`,
  };
}

/**
 * Drain a response stream (consume all data without processing)
 *
 * Handles "Network connection lost" errors gracefully - these are expected
 * when the stream is already being consumed elsewhere or when the connection
 * closes during streaming. This is not an error condition.
 */
export async function drainStream(response: Response): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    return;
  }

  try {
    while (true) {
      const { done } = await reader.read();
      if (done) {
        break;
      }
    }
  } catch {
    // Expected when stream is already being consumed or connection closes
    // This is not an error - just means the stream is done or unavailable
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Reader may already be released - this is expected
    }
  }
}
