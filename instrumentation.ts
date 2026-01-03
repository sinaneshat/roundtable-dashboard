/**
 * Next.js Server Instrumentation
 *
 * Captures server-side errors via onRequestError hook.
 * Sends exceptions to PostHog with user context from cookies.
 *
 * @see https://posthog.com/docs/error-tracking/installation/nextjs
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
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

  try {
    // Use the shared PostHog server client
    const { getPostHogClient, getDistinctIdFromCookie } = await import('@/lib/analytics/posthog-server');
    const posthog = getPostHogClient();

    if (!posthog)
      return;

    // Extract distinct_id from PostHog cookie
    const cookieHeader = Array.isArray(request.headers.cookie)
      ? request.headers.cookie.join('; ')
      : request.headers.cookie ?? null;

    const distinctId = getDistinctIdFromCookie(cookieHeader);

    await posthog.captureException(err, distinctId, {
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
