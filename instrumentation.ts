/**
 * Next.js Server Instrumentation
 *
 * OpenTelemetry Setup:
 * - Captures AI SDK streamText/generateText traces with rich metadata
 * - Exports traces to configured OTEL collector (OTEL_EXPORTER_OTLP_ENDPOINT)
 * - Edge-compatible via @vercel/otel (works with Cloudflare Workers)
 *
 * Error Tracking:
 * - Captures server-side errors via onRequestError hook
 * - Sends exceptions to PostHog with user context from cookies
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/telemetry
 * @see https://posthog.com/docs/error-tracking/installation/nextjs
 */

import type { Instrumentation } from 'next';

import { APP_VERSION } from '@/constants/version';

export async function register() {
  // =========================================================================
  // OpenTelemetry Registration
  // =========================================================================
  // @vercel/otel provides edge-compatible OpenTelemetry instrumentation
  // that works with Cloudflare Workers and captures AI SDK traces
  //
  // Required env vars:
  // - OTEL_EXPORTER_OTLP_ENDPOINT: Your OTLP collector endpoint
  // - OTEL_EXPORTER_OTLP_HEADERS: Optional auth headers (e.g., "Authorization=Bearer xxx")
  //
  // The AI SDK's experimental_telemetry in streamText automatically exports:
  // - ai.streamText spans with model, tokens, duration
  // - Custom metadata (thread_id, participant_id, etc.)
  // - Error information if streaming fails
  // Skip OTEL in local dev unless explicitly enabled
  // In production/preview, OTEL will be configured via environment variables
  if (process.env.NEXT_PUBLIC_WEBAPP_ENV === 'local' && !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    // Skip OpenTelemetry in local dev without OTEL endpoint
    return;
  }

  try {
    // Dynamic import to avoid TypeScript errors when package isn't installed

    const { registerOTel } = await import(/* webpackIgnore: true */ '@vercel/otel' as string) as { registerOTel: (config: { serviceName: string; attributes?: Record<string, string> }) => void };
    registerOTel({
      serviceName: 'roundtable-dashboard',
      // Attributes added to all spans
      attributes: {
        'service.version': APP_VERSION,
        'deployment.environment': process.env.NEXT_PUBLIC_WEBAPP_ENV || 'local',
      },
    });
  } catch {
    // @vercel/otel not installed - telemetry disabled
    // This is expected in dev if OTEL packages aren't installed
  }
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
