/**
 * Next.js Server Instrumentation
 *
 * Captures server-side errors via onRequestError hook.
 * Sends exceptions to PostHog with user context from cookies.
 *
 * Reference: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import type { Instrumentation } from 'next';

export function register() {
  // No-op for initialization
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  // Only run in nodejs runtime (not edge)
  if (process.env.NEXT_RUNTIME !== 'nodejs')
    return;

  // Skip in local environment
  if (process.env.NEXT_PUBLIC_WEBAPP_ENV === 'local')
    return;

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
  const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!apiKey || !apiHost)
    return;

  try {
    const { PostHog } = await import('posthog-node');
    const posthog = new PostHog(apiKey, {
      host: apiHost,
      flushAt: 1,
      flushInterval: 0,
    });

    let distinctId: string | null = null;

    // Extract distinct_id from PostHog cookie
    if (request.headers.cookie) {
      const cookieString = Array.isArray(request.headers.cookie)
        ? request.headers.cookie.join('; ')
        : request.headers.cookie;

      const postHogCookieMatch = cookieString.match(/ph_phc_.*?_posthog=([^;]+)/);
      if (postHogCookieMatch?.[1]) {
        try {
          const decodedCookie = decodeURIComponent(postHogCookieMatch[1]);
          const postHogData = JSON.parse(decodedCookie) as { distinct_id?: string };
          distinctId = postHogData.distinct_id ?? null;
        } catch {
          // Cookie parse failed, continue with anonymous
        }
      }
    }

    await posthog.captureException(err, distinctId ?? 'anonymous', {
      $exception_source: 'server',
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
      requestPath: request.path,
      requestMethod: request.method,
    });

    await posthog.shutdown();
  } catch {
    // Silently fail - don't crash the app for analytics errors
  }
};
