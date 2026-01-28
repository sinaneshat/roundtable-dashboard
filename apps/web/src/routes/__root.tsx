import '../styles/globals.css';

import { BRAND } from '@roundtable/shared';
import { WebAppEnvs } from '@roundtable/shared/enums';
import type { ErrorComponentProps } from '@tanstack/react-router';
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import { Icons } from '@/components/icons';
import { StructuredData } from '@/components/seo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getAppBaseUrl, getWebappEnv } from '@/lib/config/base-urls';
import { useTranslations } from '@/lib/i18n';
import { TurnstileProvider } from '@/lib/turnstile';
import { IdleLazyProvider } from '@/lib/utils/lazy-provider';
import { sessionQueryOptions } from '@/lib/data/query-options';
import type { RouterContext } from '@/router';
import { getPublicEnv } from '@/server/env';
import type { PublicEnv } from '@/server/schemas';
import { DEFAULT_PUBLIC_ENV } from '@/server/schemas';

/**
 * Root route with QueryClient context
 * QueryClientProvider is automatically wrapped by setupRouterSsrQueryIntegration in router.tsx
 * No need for manual provider - the integration handles SSR dehydration/hydration automatically
 */
const siteName = BRAND.name;
const siteDescription = BRAND.description;
const twitterHandle = BRAND.social.twitterHandle;

export const Route = createRootRouteWithContext<RouterContext>()({
  // ✅ SSR SESSION STRATEGY: Use TanStack Query cache for session deduplication
  // Server uses cookies via cookieMiddleware, client uses cached session
  // This prevents 4+ getSession calls on page load (FIX P1.5)
  beforeLoad: async ({ context }) => {
    try {
      // Use ensureQueryData to leverage TanStack Query cache
      // On server: fetches session (SSR), on client: uses cached if fresh
      const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
      return { session };
    } catch (error) {
      console.error('[ROOT] Session error:', error);
      return { session: null };
    }
  },
  component: RootComponent,
  errorComponent: RootErrorComponent,
  loader: async () => {
    const env = await getPublicEnv();
    return { env };
  },
  // ✅ RUNTIME ENV VARS: Fetch from server and pass to client
  // wrangler.jsonc vars are only available at server runtime (process.env)
  // This loader makes them available to client components
  head: () => {
    const siteUrl = getAppBaseUrl();
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: siteName },
        { name: 'description', content: siteDescription },
        // Open Graph
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: siteName },
        { property: 'og:title', content: siteName },
        { property: 'og:description', content: siteDescription },
        { property: 'og:url', content: siteUrl },
        { property: 'og:image', content: `${siteUrl}/static/og-image.png` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        // Twitter Card
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:site', content: twitterHandle },
        { name: 'twitter:creator', content: twitterHandle },
        { name: 'twitter:title', content: siteName },
        { name: 'twitter:description', content: siteDescription },
        { name: 'twitter:image', content: `${siteUrl}/static/og-image.png` },
        // Theme
        { name: 'theme-color', content: '#000000' },
        { name: 'color-scheme', content: 'dark' },
        // SEO - Default to index, follow (child routes can override)
        { name: 'robots', content: 'index, follow' },
        // PWA
        { name: 'application-name', content: siteName },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: siteName },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'format-detection', content: 'telephone=no' },
        { name: 'mobile-web-app-capable', content: 'yes' },
      ],
      links: [
        // Performance: DNS prefetch and preconnect for external resources
        { rel: 'dns-prefetch', href: 'https://challenges.cloudflare.com' },
        { rel: 'dns-prefetch', href: 'https://us.posthog.com' },
        { rel: 'preconnect', href: 'https://challenges.cloudflare.com', crossOrigin: 'anonymous' },
        { rel: 'preconnect', href: 'https://us.posthog.com', crossOrigin: 'anonymous' },
        // PWA Manifest
        { rel: 'manifest', href: '/manifest.webmanifest' },
        // Favicon - default for all browsers (without sizes for maximum compatibility)
        { rel: 'icon', type: 'image/png', href: '/icons/icon-96x96.png' },
        { rel: 'shortcut icon', type: 'image/png', href: '/icons/icon-96x96.png' },
        // Sized icons for high-DPI displays and PWA
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icons/icon-72x72.png' },
        { rel: 'icon', type: 'image/png', sizes: '96x96', href: '/icons/icon-96x96.png' },
        { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/icons/icon-192x192.png' },
        // Apple touch icon for iOS
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        // Note: canonical URLs are set per-route, not in root layout
      ],
    };
  },
});

function RootComponent() {
  const loaderData = Route.useLoaderData();
  const env = loaderData?.env ?? DEFAULT_PUBLIC_ENV;
  return (
    <RootDocument env={env}>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children, env = DEFAULT_PUBLIC_ENV }: { children: ReactNode; env?: PublicEnv }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        {/* Skip link for keyboard/screen reader users - hardcoded for robustness in critical navigation */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Skip to main content
        </a>
        <TurnstileProvider>
          {/* Non-critical analytics and PWA providers - loaded after browser idle */}
          <IdleLazyProvider<{ children: ReactNode }>
            loader={() => import('@/components/providers/service-worker-provider').then(m => ({ default: m.ServiceWorkerProvider }))}
            providerProps={{ children: null }}
          >
            <IdleLazyProvider<{ children: ReactNode; apiKey?: string }>
              loader={() => import('@/components/providers/posthog-provider').then(m => ({ default: m.default }))}
              providerProps={{ apiKey: env.VITE_POSTHOG_API_KEY, children: null }}
            >
              {children}
            </IdleLazyProvider>
          </IdleLazyProvider>
        </TurnstileProvider>
        <StructuredData type="WebApplication" />
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Check if PostHog is available for tracking
 * Returns false in local environment or SSR context
 */
function isPostHogAvailable(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return getWebappEnv() !== WebAppEnvs.LOCAL;
}

/**
 * Track error to PostHog for monitoring and debugging
 * Uses dynamic import to avoid loading PostHog in critical path
 */
async function trackErrorToPostHog(error: Error, context: { url: string; userAgent: string }) {
  if (!isPostHogAvailable()) {
    return;
  }

  // Lazy load PostHog only when needed for error tracking
  const posthog = (await import('posthog-js')).default;
  posthog.capture('$exception', {
    $exception_message: error.message,
    $exception_source: 'tanstack_router_error_boundary',
    $exception_stack_trace_raw: error.stack,
    $exception_type: error.name,
    url: context.url,
    userAgent: context.userAgent,
  });
}

function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  const isProd = getWebappEnv() === WebAppEnvs.PROD;
  const hasTrackedRef = useRef(false);
  const t = useTranslations();

  // Track error to PostHog once
  useEffect(() => {
    if (error && !hasTrackedRef.current) {
      hasTrackedRef.current = true;
      trackErrorToPostHog(error, {
        url: typeof window !== 'undefined' ? window.location.href : '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      });
    }
  }, [error]);

  return (
    <RootDocument>
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background p-4 sm:p-8">
        <div className="w-full max-w-3xl">
          {/* Error Card */}
          <div className="rounded-2xl border border-destructive/30 bg-card/80 backdrop-blur-sm p-6 sm:p-10 shadow-xl">
            {/* Header */}
            <div className="flex flex-col items-center text-center mb-8">
              <div className="rounded-full bg-destructive/10 p-4 mb-4">
                <Icons.triangleAlert className="size-10 text-destructive" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-destructive mb-2">
                {t('states.error.default')}
              </h1>
              <p className="text-muted-foreground text-base sm:text-lg max-w-md">
                {t('states.error.boundaryDescription')}
              </p>
            </div>

            {/* Error Details - Development Only */}
            {!isProd && error && (
              <details className="w-full rounded-xl bg-destructive/5 border border-destructive/20 mb-8 overflow-hidden">
                <summary className="cursor-pointer px-5 py-4 font-medium text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2">
                  <Icons.chevronRight className="size-4 transition-transform [details[open]>&]:rotate-90" />
                  <span>{t('states.error.detailsTitle')}</span>
                  <Badge variant="outline" className="ml-auto font-mono text-xs">
                    {error.name || 'Error'}
                  </Badge>
                </summary>
                <div className="px-5 pb-5 space-y-4 border-t border-destructive/10">
                  <div className="pt-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">{t('errors.boundary.errorLabel')}</p>
                    <pre className="overflow-x-auto rounded-lg bg-black/20 p-4 text-sm text-destructive/90 font-mono whitespace-pre-wrap break-words">
                      {error.message || String(error)}
                    </pre>
                  </div>
                  {error.stack && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">{t('errors.boundary.stackLabel')}</p>
                      <pre className="overflow-auto rounded-lg bg-black/20 p-4 text-xs text-muted-foreground font-mono max-h-64 whitespace-pre">
                        {error.stack}
                      </pre>
                    </div>
                  )}
                  {typeof window !== 'undefined' && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">{t('errors.boundary.urlLabel')}</p>
                      <pre className="overflow-x-auto rounded-lg bg-black/20 p-3 text-xs text-muted-foreground font-mono">
                        {window.location.href}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                variant="default"
                size="lg"
                onClick={reset}
                startIcon={<Icons.refreshCw />}
                className="min-w-[140px]"
              >
                {t('actions.tryAgain')}
              </Button>
              <Button
                variant="outline"
                size="lg"
                asChild
                startIcon={<Icons.home />}
                className="min-w-[140px]"
              >
                <Link to="/">{t('actions.goHome')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </RootDocument>
  );
}
